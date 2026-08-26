export interface AccessJwtOptions {
  teamDomain: string;
  audience: string;
  nowMs?: number;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface AccessJwtClaims {
  email?: string;
  sub?: string;
}

interface JwksKey {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
}

const JWKS_TTL_MS = 5 * 60 * 1000;
let jwksCache: { teamDomain: string; keys: JwksKey[]; fetchedAtMs: number } | null = null;

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as T;
  } catch {
    return null;
  }
}

async function getJwks(opts: AccessJwtOptions): Promise<JwksKey[]> {
  // Chỉ cache khi dùng fetch thật (không inject fetchImpl) — test inject fetchImpl
  // mỗi lần nên luôn fetch mới, tránh cache cũ nhiễm giữa các test.
  const cache = jwksCache;
  if (!opts.fetchImpl && cache && cache.teamDomain === opts.teamDomain && Date.now() - cache.fetchedAtMs < JWKS_TTL_MS) {
    return cache.keys;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`https://${opts.teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('JWKS fetch failed');
  const data = (await res.json()) as { keys?: JwksKey[] };
  const keys = data.keys ?? [];
  if (!opts.fetchImpl) jwksCache = { teamDomain: opts.teamDomain, keys, fetchedAtMs: Date.now() };
  return keys;
}

export async function verifyAccessJwt(jwt: string, opts: AccessJwtOptions): Promise<AccessJwtClaims | null> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const header = decodeJson<{ kid?: string; alg?: string }>(headerB64);
  if (!header?.kid) return null;
  if (header.alg && header.alg !== 'ES256') return null;

  let keys: JwksKey[];
  try {
    keys = await getJwks(opts);
  } catch {
    return null;
  }
  const key = keys.find((k) => k.kid === header.kid);
  if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y) return null;

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: key.x, y: key.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(signatureB64);
  } catch {
    return null;
  }
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, signature, signingInput);
  } catch {
    return null;
  }
  if (!valid) return null;

  const claims = decodeJson<{
    iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; sub?: string;
  }>(payloadB64);
  if (!claims) return null;
  if (claims.iss !== `https://${opts.teamDomain}`) return null;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud ?? ''];
  if (!auds.includes(opts.audience)) return null;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= nowSec) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > nowSec) return null;

  return { email: claims.email, sub: claims.sub };
}
