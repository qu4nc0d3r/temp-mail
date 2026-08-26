import type { Context } from 'hono';
import { ApiError } from './errors';
import { getActiveMailbox } from '../db/queries';
import { hashToken } from './token';
import { verifyAccessJwt } from './access-jwt';
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
  const jwt = c.req.header('cf-access-jwt-assertion') ?? '';
  if (!jwt) throw new ApiError(401, 'UNAUTHORIZED', 'Missing admin credentials');
  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  const audience = c.env.ACCESS_APP_AUD;
  if (!teamDomain || !audience) throw new ApiError(401, 'UNAUTHORIZED', 'Admin auth not configured');
  // verifyAccessJwt can throw on a malformed base64 signature segment (unguarded
  // atob); treat any throw as invalid credentials so the route stays fail-closed
  // with a clean 401 instead of surfacing as a 500.
  let claims: Awaited<ReturnType<typeof verifyAccessJwt>> | null = null;
  try {
    claims = await verifyAccessJwt(jwt, { teamDomain, audience });
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin credentials');
  }
  if (!claims) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin credentials');
  return next();
}
