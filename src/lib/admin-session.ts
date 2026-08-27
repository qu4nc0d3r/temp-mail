import { generateId } from './token';

export const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

interface AdminSessionPayload {
  exp: number;
  nonce: string;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function createAdminSession(secret: string, nowMs: number): Promise<{ token: string; expiresAt: number }> {
  const exp = nowMs + ADMIN_SESSION_TTL_MS;
  const payload = JSON.stringify({ exp, nonce: generateId() });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64)));
  return { token: `${payloadB64}.${toBase64Url(sig)}`, expiresAt: exp };
}

export async function verifyAdminSession(token: string, secret: string, nowMs: number): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  let sig: Uint8Array;
  try { sig = fromBase64Url(sigB64); } catch { return false; }
  const key = await hmacKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig[i] ^ expected[i];
  if (diff !== 0) return false;
  let payload: AdminSessionPayload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as AdminSessionPayload; } catch { return false; }
  return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp > nowMs;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
