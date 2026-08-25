import { Hono } from 'hono';
import { ApiError } from '../lib/errors';
import { authenticate } from '../lib/auth';
import {
  createMailbox, getActiveMailbox, checkAndRecordUsage, listMessages,
  getMessage, extendMailbox, deleteMailbox,
} from '../db/queries';
import { generateToken, hashToken, hashIp } from '../lib/token';
import { validateLocalPart } from '../lib/validate';
import type { Env } from '../env';

const TTL_MS = 10 * 60 * 1000;
const MAX_TOTAL_MS = 60 * 60 * 1000;

export const mailboxRoutes = new Hono<{ Bindings: Env }>();

mailboxRoutes.post('/', async (c) => {
  const nowMs = Date.now();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const ipHash = await hashIp(ip, c.env.SALT_IP);
  const allowed = await checkAndRecordUsage(c.env.DB, ipHash, nowMs);
  if (!allowed) throw new ApiError(429, 'RATE_LIMITED', 'Too many mailboxes created this hour');

  const body = (await c.req.json().catch(() => ({}))) as { custom?: unknown };
  let address: string;

  if (body.custom !== undefined) {
    if (typeof body.custom !== 'string') throw new ApiError(400, 'INVALID_NAME', 'custom must be a string');
    const result = validateLocalPart(body.custom);
    if (!result.ok) throw new ApiError(400, 'INVALID_NAME', result.reason);
    const full = `${result.value}@${c.env.DOMAIN}`;
    if (await getActiveMailbox(c.env.DB, full, nowMs)) throw new ApiError(409, 'TAKEN', 'Name already in use');
    address = full;
  } else {
    address = `${generateToken().slice(0, 8)}@${c.env.DOMAIN}`;
  }

  const token = generateToken();
  const tokenHash = await hashToken(token, c.env.SALT_TOKEN);
  const created = await createMailbox(c.env.DB, address, tokenHash, nowMs, nowMs + TTL_MS);
  if (!created) throw new ApiError(409, 'TAKEN', 'Name already in use');

  return c.json({ address, token, expiresAt: nowMs + TTL_MS, serverTime: nowMs }, 201);
});

mailboxRoutes.get('/:address/messages', async (c) => {
  const nowMs = Date.now();
  const mailbox = await authenticate(c, c.req.param('address'), nowMs);
  const messages = await listMessages(c.env.DB, mailbox.address, nowMs);
  return c.json({ messages, expiresAt: mailbox.expires_at, serverTime: nowMs });
});

mailboxRoutes.get('/:address/messages/:id', async (c) => {
  const nowMs = Date.now();
  const mailbox = await authenticate(c, c.req.param('address'), nowMs);
  const message = await getMessage(c.env.DB, c.req.param('id'), mailbox.address, nowMs);
  if (!message) throw new ApiError(404, 'NOT_FOUND', 'Message not found');
  return c.json({ message });
});

mailboxRoutes.post('/:address/extend', async (c) => {
  const nowMs = Date.now();
  const mailbox = await authenticate(c, c.req.param('address'), nowMs);
  const newExpiry = Math.min(nowMs + TTL_MS, mailbox.created_at + MAX_TOTAL_MS);
  await extendMailbox(c.env.DB, mailbox.address, newExpiry, nowMs);
  return c.json({ expiresAt: newExpiry, serverTime: nowMs });
});

mailboxRoutes.delete('/:address', async (c) => {
  const nowMs = Date.now();
  const mailbox = await authenticate(c, c.req.param('address'), nowMs);
  await deleteMailbox(c.env.DB, mailbox.address);
  return c.json({ ok: true });
});
