import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { requireAdmin } from '../src/lib/auth';
import { errorHandler } from '../src/lib/errors';
import { createMailbox, insertMessage, logEvent, setSetting } from '../src/db/queries';
import { createAdminSession } from '../src/lib/admin-session';
import type { AdminEventRow, AdminMailboxRow, AdminMessageRow, AdminOverview, Env, StatsPoint } from '../src/env';

beforeEach(async () => {
  await setupDb();
});

function makeAdminApp(overrides: Partial<Env>): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', requireAdmin);
  app.get('/ping', (c) => c.json({ ok: true }));
  // Production mounts app.onError(errorHandler) (src/index.ts) which maps
  // ApiError throws to their HTTP status. Hono's default handler returns 500
  // for thrown errors, so mirror production here or fail-closed 401s read as 500s.
  app.onError(errorHandler);
  return app;
}

describe('requireAdmin middleware', () => {
  it('rejects when bypass off and no bearer token', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', {}, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and ADMIN_API_KEY not configured', async () => {
    const app = makeAdminApp({});
    // env từ cloudflare:test đã có ADMIN_API_KEY (miniflare bindings) — phải override về undefined.
    const res = await app.request('/ping', { headers: { authorization: 'Bearer x.y.z' } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and token is invalid', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', { headers: { authorization: 'Bearer garbage.token.here' } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and session is expired', async () => {
    const app = makeAdminApp({});
    const { token } = await createAdminSession('test-key', Date.now() - 3 * 60 * 60 * 1000);
    const res = await app.request('/ping', { headers: { authorization: `Bearer ${token}` } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid session', async () => {
    const app = makeAdminApp({});
    const { token } = await createAdminSession('test-key', Date.now());
    const res = await app.request('/ping', { headers: { authorization: `Bearer ${token}` } }, { ...env, ADMIN_DEV_BYPASS: undefined, ADMIN_API_KEY: 'test-key' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/login', () => {
  it('rejects wrong key', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('issues a session for the correct key', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'test-admin-api-key' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; expiresAt: number }>();
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(2);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects non-string or empty key body', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 123 }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/config', () => {
  it('returns config with feature flags via SELF (bypass mode in tests)', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config');
    expect(res.status).toBe(200);
    const body = await res.json<{ domain: string; devBypassEnabled: boolean; features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.domain).toBe(env.DOMAIN);
    expect(body.devBypassEnabled).toBe(true);
    expect(body.features).toHaveLength(4);
    expect(body.features.find((f) => f.key === 'mailbox_create')).toEqual({ key: 'mailbox_create', enabled: true, isDefault: true });
  });
});

describe('PUT/DELETE /api/admin/config/features', () => {
  it('toggles a feature and records a config_changed event', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'rate_limit', enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.features.find((f) => f.key === 'rate_limit')).toEqual({ key: 'rate_limit', enabled: false, isDefault: false });

    const rows = await env.DB.prepare(`SELECT * FROM admin_events WHERE type = 'config_changed'`).all<{ detail: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].detail).toBe('rate_limit=off');

    const cfg = await (await SELF.fetch('https://example.com/api/admin/config')).json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(cfg.features.find((f) => f.key === 'rate_limit')?.enabled).toBe(false);
  });

  it('rejects an unknown key with 400 INVALID_KEY', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'nope', enabled: true }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('INVALID_KEY');
  });

  it('rejects a non-boolean enabled value with 400 INVALID_VALUE', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config/features', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'rate_limit', enabled: 'yes' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('INVALID_VALUE');
  });

  it('resets a feature back to default', async () => {
    await setSetting(env.DB, 'feature.custom_name', '0');
    const res = await SELF.fetch('https://example.com/api/admin/config/features/custom_name', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json<{ features: { key: string; enabled: boolean; isDefault: boolean }[] }>();
    expect(body.features.find((f) => f.key === 'custom_name')).toEqual({ key: 'custom_name', enabled: true, isDefault: true });
  });
});

describe('GET /api/admin/overview & /stats', () => {
  it('overview returns KPI shape', async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    const res = await SELF.fetch('https://example.com/api/admin/overview');
    expect(res.status).toBe(200);
    const body = await res.json<AdminOverview>();
    expect(body.activeMailboxes).toBe(1);
    expect(typeof body.mailPerMinute).toBe('number');
  });

  it('stats validates range param (7d vs 24h)', async () => {
    const r24 = await (await SELF.fetch('https://example.com/api/admin/stats?range=24h')).json<{ range: string; points: StatsPoint[] }>();
    expect(r24.range).toBe('24h');
    expect(r24.points.length).toBe(96);
    const r7 = await (await SELF.fetch('https://example.com/api/admin/stats?range=7d')).json<{ range: string; points: StatsPoint[] }>();
    expect(r7.range).toBe('7d');
    expect(r7.points.length).toBe(28);
  });
});

describe('GET /api/admin lists', () => {
  beforeEach(async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    await insertMessage(env.DB, {
      id: 'msg1', mailbox: `a@${env.DOMAIN}`, fromName: 'Alice', fromAddr: 'alice@x.com',
      subject: 'Chào', preview: 'p', htmlBody: null, textBody: 'b', attachmentsCount: 0, receivedAt: Date.now(),
    });
    await logEvent(env.DB, { type: 'rate_limited', ipHash: 'h1', createdAtMs: Date.now() });
  });

  it('top senders ranks by count', async () => {
    const res = await (await SELF.fetch('https://example.com/api/admin/top?by=senders&limit=5')).json<{ by: string; items: { label: string; count: number }[] }>();
    expect(res.by).toBe('senders');
    expect(res.items[0]).toEqual({ label: 'alice@x.com', count: 1 });
  });

  it('top ips uses mailbox_created events', async () => {
    const res = await (await SELF.fetch('https://example.com/api/admin/top?by=ips&limit=5')).json<{ by: string; items: { label: string; count: number }[] }>();
    expect(res.items).toEqual([]); // chưa có event mailbox_created trong 24h
  });

  it('mailboxes list paginates and hides token_hash', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/mailboxes?limit=10&offset=0');
    expect(res.status).toBe(200);
    const body = await res.json<{ mailboxes: AdminMailboxRow[]; total: number; limit: number }>();
    expect(body.total).toBe(1);
    expect(body.mailboxes[0]).not.toHaveProperty('token_hash');
    expect(body.mailboxes[0].address).toBe(`a@${env.DOMAIN}`);
  });

  it('messages list returns preview only', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/messages?limit=10')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(body.messages[0].from_addr).toBe('alice@x.com');
    expect(body.messages[0]).not.toHaveProperty('html_body');
  });

  it('events list filters by type', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/events?type=rate_limited')).json<{ events: AdminEventRow[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.events[0].type).toBe('rate_limited');
    const none = await (await SELF.fetch('https://example.com/api/admin/events?type=recaptcha_failed')).json<{ events: AdminEventRow[]; total: number }>();
    expect(none.total).toBe(0);
  });

  it('clamps limit to 100 and validates offset', async () => {
    const body = await (await SELF.fetch('https://example.com/api/admin/mailboxes?limit=9999&offset=-5')).json<{ limit: number; offset: number }>();
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
  });
});

describe('GET /api/admin/messages search/filter/sort', () => {
  beforeEach(async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    await insertMessage(env.DB, {
      id: 'm1', mailbox: `a@${env.DOMAIN}`, fromName: 'Alice', fromAddr: 'alice@x.com',
      subject: 'Hello', preview: 'preview 1', htmlBody: '<p>hello</p>', textBody: 'hello', attachmentsCount: 1, receivedAt: 1000,
    });
    await insertMessage(env.DB, {
      id: 'm2', mailbox: `b@${env.DOMAIN}`, fromName: 'Bob', fromAddr: 'bob@x.com',
      subject: 'Report', preview: 'preview 2', htmlBody: null, textBody: 'report', attachmentsCount: 0, receivedAt: 2000,
    });
    await insertMessage(env.DB, {
      id: 'm3', mailbox: `a@${env.DOMAIN}`, fromName: 'Carol', fromAddr: 'carol@x.com',
      subject: 'Advertise', preview: 'preview 3', htmlBody: null, textBody: 'spam', attachmentsCount: 0, receivedAt: 3000,
    });
  });

  it('filters by q across sender/subject/mailbox', async () => {
    const bySender = await (await SELF.fetch('https://example.com/api/admin/messages?q=alice')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(bySender.total).toBe(1);
    expect(bySender.messages[0].id).toBe('m1');

    const bySubject = await (await SELF.fetch('https://example.com/api/admin/messages?q=report')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(bySubject.total).toBe(1);
    expect(bySubject.messages[0].id).toBe('m2');

    const byMailbox = await (await SELF.fetch(`https://example.com/api/admin/messages?q=${encodeURIComponent(`a@${env.DOMAIN}`)}`)).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(byMailbox.total).toBe(2);
    expect(byMailbox.messages.map((m) => m.id).sort()).toEqual(['m1', 'm3']);
  });

  it('filters by exact mailbox', async () => {
    const res = await (await SELF.fetch(`https://example.com/api/admin/messages?mailbox=${encodeURIComponent(`b@${env.DOMAIN}`)}`)).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(res.total).toBe(1);
    expect(res.messages[0].id).toBe('m2');
  });

  it('sorts by from_addr asc/desc', async () => {
    const asc = await (await SELF.fetch('https://example.com/api/admin/messages?sortBy=from_addr&order=asc')).json<{ messages: AdminMessageRow[] }>();
    expect(asc.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    const desc = await (await SELF.fetch('https://example.com/api/admin/messages?sortBy=from_addr&order=desc')).json<{ messages: AdminMessageRow[] }>();
    expect(desc.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('defaults to received_at desc and falls back on unknown sortBy', async () => {
    const plain = await (await SELF.fetch('https://example.com/api/admin/messages')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(plain.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);

    const bogus = await (await SELF.fetch('https://example.com/api/admin/messages?sortBy=bogus')).json<{ messages: AdminMessageRow[]; total: number }>();
    expect(bogus.total).toBe(3);
    expect(bogus.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
  });
});

describe('GET /api/admin/messages/:id', () => {
  beforeEach(async () => {
    await createMailbox(env.DB, `a@${env.DOMAIN}`, 'h', Date.now() - 1000, Date.now() + 60_000);
    await insertMessage(env.DB, {
      id: 'm1', mailbox: `a@${env.DOMAIN}`, fromName: 'Alice', fromAddr: 'alice@x.com',
      subject: 'Hello', preview: 'preview 1', htmlBody: '<p>hello</p>', textBody: 'hello', attachmentsCount: 2, receivedAt: 1000,
    });
  });

  it('returns full message body', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/messages/m1');
    expect(res.status).toBe(200);
    const body = await res.json<{ message: AdminMessageRow & { html_body: string | null; text_body: string | null; attachments_count: number } }>();
    expect(body.message.id).toBe('m1');
    expect(body.message.html_body).toBe('<p>hello</p>');
    expect(body.message.text_body).toBe('hello');
    expect(body.message.attachments_count).toBe(2);
    expect(body.message.mailbox).toBe(`a@${env.DOMAIN}`);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/messages/nope');
    expect(res.status).toBe(404);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('NOT_FOUND');
  });
});
