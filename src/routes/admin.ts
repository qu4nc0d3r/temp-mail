import { Hono } from 'hono';
import { requireAdmin } from '../lib/auth';
import { getAdminOverview, getStatsSeries } from '../db/queries';
import type { Env } from '../env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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
