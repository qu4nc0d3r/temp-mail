import { Hono } from 'hono';
import { resolveFeatureFlags, type FeatureKey } from './lib/features';
import { errorHandler } from './lib/errors';
import { mailboxRoutes } from './routes/mailbox';
import { adminRoutes } from './routes/admin';
import { email } from './email';
import { scheduled } from './scheduled';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/mailbox', mailboxRoutes);
app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/api/config', async (c) => {
  const flags = await resolveFeatureFlags(c.env.DB, c.env);
  const flagOn = (key: FeatureKey) => flags.find((f) => f.key === key)!.enabled;
  return c.json({
    recaptchaSiteKey: flagOn('recaptcha') ? (c.env.RECAPTCHA_SITE_KEY ?? '') : '',
    features: {
      customName: flagOn('custom_name'),
      mailboxCreate: flagOn('mailbox_create'),
    },
  });
});
app.route('/api/admin', adminRoutes);

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError(errorHandler);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  email,
  scheduled,
} satisfies ExportedHandler<Env>;
