import { Hono } from 'hono';
import { requireAdmin } from '../lib/auth';
import type { Env } from '../env';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/config', (c) => {
  return c.json({
    domain: c.env.DOMAIN,
    recaptchaEnabled: Boolean(c.env.RECAPTCHA_SECRET_KEY && c.env.RECAPTCHA_SITE_KEY),
    devBypassEnabled: c.env.ADMIN_DEV_BYPASS === 'true',
  });
});
