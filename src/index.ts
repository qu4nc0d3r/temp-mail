import { Hono } from 'hono';
import { errorHandler } from './lib/errors';
import { mailboxRoutes } from './routes/mailbox';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/mailbox', mailboxRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError(errorHandler);

export { email } from './email';
export { scheduled } from './scheduled';

export default app;
