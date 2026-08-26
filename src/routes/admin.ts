import { Hono } from 'hono';
import type { Context } from 'hono';
import { requireAdmin } from '../lib/auth';
import { getAdminOverview, getStatsSeries, getTopSenders, getTopIpHashes, listMailboxes, listRecentMessages, listEvents } from '../db/queries';
import type { AdminEventType, Env } from '../env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

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

adminRoutes.get('/config', (c) => {
  return c.json({
    domain: c.env.DOMAIN,
    recaptchaEnabled: Boolean(c.env.RECAPTCHA_SECRET_KEY && c.env.RECAPTCHA_SITE_KEY),
    devBypassEnabled: c.env.ADMIN_DEV_BYPASS === 'true',
  });
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

const EVENT_TYPES: readonly string[] = ['mailbox_created', 'rate_limited', 'recaptcha_failed', 'cron_cleanup'];

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
