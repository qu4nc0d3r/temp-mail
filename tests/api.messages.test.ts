import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { insertMessage } from '../src/db/queries';

const DOMAIN = env.DOMAIN;

async function createMailboxAndToken(): Promise<{ address: string; token: string }> {
  const res = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
  const body = await res.json<{ address: string; token: string }>();
  return { address: body.address, token: body.token };
}

beforeEach(async () => {
  await setupDb();
});

describe('GET /api/mailbox/:address/messages', () => {
  it('lists messages for authenticated mailbox', async () => {
    const { address, token } = await createMailboxAndToken();
    await insertMessage(env.DB, {
      id: 'm1', mailbox: address, fromName: 'Alice', fromAddr: 'a@x.com',
      subject: 'Hello', preview: 'p', htmlBody: null, textBody: 'b', attachmentsCount: 0, receivedAt: Date.now(),
    });
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ messages: { id: string }[]; expiresAt: number; serverTime: number }>();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe('m1');
  });

  it('401 without token', async () => {
    const { address } = await createMailboxAndToken();
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages`);
    expect(res.status).toBe(401);
  });

  it('401 with wrong token', async () => {
    const { address } = await createMailboxAndToken();
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages`, {
      headers: { authorization: 'Bearer ' + 'f'.repeat(64) },
    });
    expect(res.status).toBe(401);
  });

  it('404 for unknown address', async () => {
    const res = await SELF.fetch(`https://example.com/api/mailbox/nobody@${DOMAIN}/messages`, {
      headers: { authorization: 'Bearer ' + 'f'.repeat(64) },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/mailbox/:address/messages/:id', () => {
  it('returns full message detail', async () => {
    const { address, token } = await createMailboxAndToken();
    await insertMessage(env.DB, {
      id: 'm1', mailbox: address, fromName: 'Alice', fromAddr: 'a@x.com',
      subject: 'Hello', preview: 'p', htmlBody: '<b>hi</b>', textBody: 'b', attachmentsCount: 1, receivedAt: Date.now(),
    });
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages/m1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ message: { html_body: string; attachments_count: number } }>();
    expect(body.message.html_body).toBe('<b>hi</b>');
    expect(body.message.attachments_count).toBe(1);
  });

  it('404 for unknown message', async () => {
    const { address, token } = await createMailboxAndToken();
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages/nope`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/mailbox/:address/extend', () => {
  it('extends expiry by 10 min', async () => {
    const { address, token } = await createMailboxAndToken();
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/extend`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ expiresAt: number }>();
    // extend = now + 10 phút (gia hạn 10 phút mới kể từ lúc bấm)
    const expected = Date.now() + 10 * 60 * 1000;
    expect(body.expiresAt).toBeGreaterThan(expected - 2000);
    expect(body.expiresAt).toBeLessThan(expected + 2000);
  });

  it('caps total lifetime at 60 minutes', async () => {
    const res = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    const { address, token } = await res.json<{ address: string; token: string }>();
    // mô phỏng mailbox đã tồn tại 55 phút bằng cách set expires_at trực tiếp
    const now = Date.now();
    const created = now - 55 * 60 * 1000;
    await env.DB.prepare('UPDATE mailboxes SET created_at = ?, expires_at = ? WHERE address = ?')
      .bind(created, now + 5 * 60 * 1000, address).run();
    const ext = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/extend`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ext.status).toBe(200);
    const body = await ext.json<{ expiresAt: number }>();
    expect(body.expiresAt).toBe(created + 60 * 60 * 1000);
  });
});

describe('DELETE /api/mailbox/:address', () => {
  it('deletes the mailbox', async () => {
    const { address, token } = await createMailboxAndToken();
    const res = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const after = await SELF.fetch(`https://example.com/api/mailbox/${encodeURIComponent(address)}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(404);
  });
});
