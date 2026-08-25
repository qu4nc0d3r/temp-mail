import type { Env } from '../env';

export const RECAPTCHA_ACTION = 'create_mailbox';
const SITE_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_THRESHOLD = 0.5;

interface SiteVerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

type SiteVerifyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function parseThreshold(value: string | undefined): number {
  if (!value) return DEFAULT_THRESHOLD;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : DEFAULT_THRESHOLD;
}

/**
 * Verifies a reCAPTCHA v3 token against Google. Returns true in "disabled"
 * mode when no secret is configured (local dev / tests). Otherwise the check
 * fails closed: any network error, non-200, failed verification, mismatched
 * action or low score rejects the request.
 */
export async function verifyRecaptcha(
  env: Env,
  token: string,
  remoteIp?: string,
  fetchImpl: SiteVerifyFetch = fetch,
): Promise<boolean> {
  const secret = env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  let res: Response;
  try {
    res = await fetchImpl(SITE_VERIFY_URL, { method: 'POST', body });
  } catch {
    return false;
  }
  if (!res.ok) return false;

  let data: SiteVerifyResponse;
  try {
    data = (await res.json()) as SiteVerifyResponse;
  } catch {
    return false;
  }

  if (data.success !== true) return false;
  if (data.action !== RECAPTCHA_ACTION) return false;
  return (data.score ?? 0) >= parseThreshold(env.RECAPTCHA_THRESHOLD);
}
