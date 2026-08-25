import type { Context } from 'hono';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorHandler(err: unknown, c: Context): Response {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
}
