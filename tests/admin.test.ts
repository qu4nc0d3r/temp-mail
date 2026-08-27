import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { requireAdmin } from '../src/lib/auth';
import { errorHandler } from '../src/lib/errors';
import { createMailbox, insertMessage, logEvent } from '../src/db/queries';
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
  it('returns read-only config via SELF (bypass mode in tests)', async () => {
    const res = await SELF.fetch('https://example.com/api/admin/config');
    expect(res.status).toBe(200);
    const body = await res.json<{ domain: string; recaptchaEnabled: boolean; devBypassEnabled: boolean }>();
    expect(body.domain).toBe(env.DOMAIN);
    expect(body.devBypassEnabled).toBe(true);
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
