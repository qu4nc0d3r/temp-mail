import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { SELF, env } from 'cloudflare:test';
import { setupDb } from './helpers/db';
import { requireAdmin } from '../src/lib/auth';
import { errorHandler } from '../src/lib/errors';
import type { Env } from '../src/env';

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
  it('rejects when bypass off and no token', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', {}, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and ACCESS vars not configured', async () => {
    const app = makeAdminApp({});
    const res = await app.request('/ping', { headers: { 'cf-access-jwt-assertion': 'x.y.z' } }, { ...env, ADMIN_DEV_BYPASS: undefined });
    expect(res.status).toBe(401);
  });

  it('rejects when bypass off and token is invalid', async () => {
    const app = makeAdminApp({});
    const res = await app.request(
      '/ping',
      { headers: { 'cf-access-jwt-assertion': 'x.y.z' } },
      { ...env, ADMIN_DEV_BYPASS: undefined, ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_APP_AUD: 'aud' },
    );
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
