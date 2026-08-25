export const RESERVED_NAMES: readonly string[] = [
  'admin', 'postmaster', 'abuse', 'noreply', 'no-reply', 'support', 'webmaster',
  'hostmaster', 'root', 'security', 'privacy', 'contact', 'info', 'help',
  'sales', 'billing', 'unsub', 'unsubscribe', 'mailer-daemon',
];

const NAME_RE = /^[a-z0-9._-]{3,30}$/;

export type LocalPartResult = { ok: true; value: string } | { ok: false; reason: string };

export function validateLocalPart(input: string): LocalPartResult {
  const value = input.trim().toLowerCase();
  if (!NAME_RE.test(value)) {
    return { ok: false, reason: 'Name must be 3-30 characters: lowercase letters, digits, dot, dash, underscore' };
  }
  if (RESERVED_NAMES.includes(value)) {
    return { ok: false, reason: 'This name is reserved' };
  }
  return { ok: true, value };
}
