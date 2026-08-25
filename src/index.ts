import { Hono } from 'hono';
import { errorHandler } from './lib/errors';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError(errorHandler);

export default app;
