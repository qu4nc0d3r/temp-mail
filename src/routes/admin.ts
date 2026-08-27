import { Hono } from 'hono';
import type { Context } from 'hono';
import { requireAdmin } from '../lib/auth';
import { ApiError } from '../lib/errors';
import { createAdminSession, constantTimeEqual } from '../lib/admin-session';
import { getAdminOverview, getStatsSeries, getTopSenders, getTopIpHashes, listMailboxes, listRecentMessages, listEvents, logEvent, setSetting, deleteSetting } from '../db/queries';
import { resolveFeatureFlags, FEATURE_KEYS, type FeatureKey } from '../lib/features';
import type { AdminEventType, Env } from '../env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown };
  const apiKey = c.env.ADMIN_API_KEY;
  if (!apiKey) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  const nowMs = Date.now();
  if (typeof body.apiKey !== 'string' || !constantTimeEqual(body.apiKey, apiKey)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
  }
  const { token, expiresAt } = await createAdminSession(apiKey, nowMs);
  return c.json({ token, expiresAt, serverTime: nowMs });
});

adminRoutes.use('*', requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;

function parsePaging(c: Context<{ Bindings: Env }>): { limit: number; offset: number } {
  const rawLimit = Number(c.req.query('limit'));
  const rawOffset = Number(c.req.query('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

adminRoutes.get('/config', async (c) => {
  const features = await resolveFeatureFlags(c.env.DB, c.env);
  return c.json({
    domain: c.env.DOMAIN,
    devBypassEnabled: c.env.ADMIN_DEV_BYPASS === 'true',
    features,
  });
});

adminRoutes.put('/config/features', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  if (typeof body.key !== 'string' || !(FEATURE_KEYS as readonly string[]).includes(body.key)) {
    throw new ApiError(400, 'INVALID_KEY', 'Unknown feature key');
  }
  if (typeof body.enabled !== 'boolean') {
    throw new ApiError(400, 'INVALID_VALUE', 'enabled must be a boolean');
  }
  const key = body.key as FeatureKey;
  await setSetting(c.env.DB, `feature.${key}`, body.enabled ? '1' : '0');
  await logEvent(c.env.DB, { type: 'config_changed', detail: `${key}=${body.enabled ? 'on' : 'off'}` });
  return c.json({ features: await resolveFeatureFlags(c.env.DB, c.env) });
});

adminRoutes.delete('/config/features/:key', async (c) => {
  const raw = c.req.param('key');
  if (!(FEATURE_KEYS as readonly string[]).includes(raw)) {
    throw new ApiError(400, 'INVALID_KEY', 'Unknown feature key');
  }
  const key = raw as FeatureKey;
  await deleteSetting(c.env.DB, `feature.${key}`);
  await logEvent(c.env.DB, { type: 'config_changed', detail: `${key}=default` });
  return c.json({ features: await resolveFeatureFlags(c.env.DB, c.env) });
});

adminRoutes.get('/overview', async (c) => {
  return c.json(await getAdminOverview(c.env.DB, Date.now()));
});

adminRoutes.get('/stats', async (c) => {
  const is7d = c.req.query('range') === '7d';
  const rangeMs = is7d ? 7 * DAY_MS : DAY_MS;
  const bucketMs = is7d ? 6 * HOUR_MS : 15 * 60 * 1000;
  const points = await getStatsSeries(c.env.DB, Date.now(), rangeMs, bucketMs);
  return c.json({ range: is7d ? '7d' : '24h', points });
});

const EVENT_TYPES: readonly string[] = ['mailbox_created', 'rate_limited', 'recaptcha_failed', 'cron_cleanup', 'config_changed'];

adminRoutes.get('/top', async (c) => {
  const by = c.req.query('by') === 'ips' ? 'ips' : 'senders';
  const rawLimit = Number(c.req.query('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 10;
  const items = by === 'ips'
    ? await getTopIpHashes(c.env.DB, Date.now(), limit)
    : await getTopSenders(c.env.DB, Date.now(), limit);
  return c.json({ by, items });
});

adminRoutes.get('/events', async (c) => {
  const rawType = c.req.query('type');
  const type = rawType && EVENT_TYPES.includes(rawType) ? (rawType as AdminEventType) : null;
  const { limit, offset } = parsePaging(c);
  const data = await listEvents(c.env.DB, type, limit, offset);
  return c.json({ events: data.items, total: data.total, limit, offset });
});

adminRoutes.get('/mailboxes', async (c) => {
  const { limit, offset } = parsePaging(c);
  const data = await listMailboxes(c.env.DB, limit, offset);
  return c.json({ mailboxes: data.items, total: data.total, limit, offset });
});

adminRoutes.get('/messages', async (c) => {
  const { limit, offset } = parsePaging(c);
  const data = await listRecentMessages(c.env.DB, limit, offset);
  return c.json({ messages: data.items, total: data.total, limit, offset });
});
