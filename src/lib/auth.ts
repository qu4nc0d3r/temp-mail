import type { Context } from 'hono';
import { ApiError } from './errors';
import { getActiveMailbox } from '../db/queries';
import { hashToken } from './token';
import { verifyAdminSession } from './admin-session';
import type { Env, MailboxRecord } from '../env';

export async function authenticate(c: Context<{ Bindings: Env }>, address: string, nowMs: number): Promise<MailboxRecord> {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Missing bearer token');
  const mailbox = await getActiveMailbox(c.env.DB, address, nowMs);
  if (!mailbox) throw new ApiError(404, 'NOT_FOUND', 'Mailbox not found or expired');
  const tokenHash = await hashToken(token, c.env.SALT_TOKEN);
  if (tokenHash !== mailbox.token_hash) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid token');
  return mailbox;
}

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: () => Promise<void>): Promise<Response | void> {
  if (c.env.ADMIN_DEV_BYPASS === 'true') return next();
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Missing admin credentials');
  const apiKey = c.env.ADMIN_API_KEY;
  if (!apiKey) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  // verifyAdminSession never throws (malformed/expired → false) → fail-closed 401.
  const ok = await verifyAdminSession(token, apiKey, Date.now());
  if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin credentials');
  return next();
}
