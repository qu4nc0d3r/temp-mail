import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';

const DOMAIN = env.DOMAIN;

beforeEach(async () => {
  await setupDb();
});

describe('POST /api/mailbox', () => {
  it('creates a random mailbox and returns token once', async () => {
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ address: string; token: string; expiresAt: number; serverTime: number }>();
    expect(body.address).toMatch(new RegExp(`^[a-z0-9]{8}@${DOMAIN.replace(/\./g, '\\.')}$`));
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.expiresAt - body.serverTime).toBe(10 * 60 * 1000);
  });

  it('creates custom mailbox', async () => {
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'JohnSmith' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ address: string }>();
    expect(body.address).toBe(`johnsmith@${DOMAIN}`);
  });

  it('rejects invalid custom name', async () => {
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'no!no!' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('INVALID_NAME');
  });

  it('rejects reserved custom name', async () => {
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'admin' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('INVALID_NAME');
  });

  it('returns 409 when custom name taken', async () => {
    await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'john' }),
    });
    const res = await SELF.fetch('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ custom: 'john' }),
    });
    expect(res.status).toBe(409);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('TAKEN');
  });

  it('rate limits to 20 per hour per ip', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
      expect(r.status).toBe(201);
    }
    const blocked = await SELF.fetch('https://example.com/api/mailbox', { method: 'POST' });
    expect(blocked.status).toBe(429);
    expect((await blocked.json<{ error: { code: string } }>()).error.code).toBe('RATE_LIMITED');
  });
});
