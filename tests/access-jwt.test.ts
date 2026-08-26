import { describe, it, expect } from 'vitest';
import { verifyAccessJwt } from '../src/lib/access-jwt';

const TEAM = 'toolviet.cloudflareaccess.com';
const AUD = 'test-aud';

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function enc(obj: unknown): string {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function makeKeyPair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return pair as CryptoKeyPair;
}

async function signToken(privateKey: CryptoKey, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'ES256', kid: 'test-key' };
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

function jwksFetcher(pubJwk: JsonWebKey): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ keys: [{ ...pubJwk, kid: 'test-key', alg: 'ES256' }] }), { status: 200 })) as typeof fetch;
}

async function validToken(): Promise<{ token: string; fetchImpl: typeof fetch }> {
  const keyPair = await makeKeyPair();
  const pubJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await signToken(keyPair.privateKey, {
    iss: `https://${TEAM}`, aud: [AUD], email: 'admin@toolviet.net',
    exp: nowSec + 3600, nbf: nowSec - 10, iat: nowSec,
  });
  return { token, fetchImpl: jwksFetcher(pubJwk) };
}

describe('verifyAccessJwt', () => {
  it('accepts a valid signed token and returns email', async () => {
    const { token, fetchImpl } = await validToken();
    const claims = await verifyAccessJwt(token, { teamDomain: TEAM, audience: AUD, fetchImpl });
    expect(claims?.email).toBe('admin@toolviet.net');
  });

  it('rejects a token with a tampered payload', async () => {
    const { token, fetchImpl } = await validToken();
    const [h, , s] = token.split('.');
    const tampered = `${h}.${enc({ iss: `https://${TEAM}`, aud: [AUD], email: 'evil@toolviet.net', exp: 9999999999 })}.${s}`;
    expect(await verifyAccessJwt(tampered, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { token, fetchImpl } = await validToken();
    const [h, , s] = token.split('.');
    const expired = `${h}.${enc({ iss: `https://${TEAM}`, aud: [AUD], email: 'admin@toolviet.net', exp: Math.floor(Date.now() / 1000) - 10 })}.${s}`;
    expect(await verifyAccessJwt(expired, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });

  it('rejects a token with the wrong audience', async () => {
    const { token, fetchImpl } = await validToken();
    expect(await verifyAccessJwt(token, { teamDomain: TEAM, audience: 'other-aud', fetchImpl })).toBeNull();
  });

  it('rejects a token signed by a key not in the JWKS', async () => {
    const other = await makeKeyPair();
    const pubJwk = (await crypto.subtle.exportKey('jwk', other.publicKey)) as JsonWebKey;
    const { token } = await validToken();
    expect(await verifyAccessJwt(token, { teamDomain: TEAM, audience: AUD, fetchImpl: jwksFetcher(pubJwk) })).toBeNull();
  });

  it('rejects malformed jwt and wrong issuer', async () => {
    const { token, fetchImpl } = await validToken();
    expect(await verifyAccessJwt('not-a-jwt', { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
    const [h, , s] = token.split('.');
    const wrongIss = `${h}.${enc({ iss: 'https://evil.example', aud: [AUD], exp: Math.floor(Date.now() / 1000) + 3600 })}.${s}`;
    expect(await verifyAccessJwt(wrongIss, { teamDomain: TEAM, audience: AUD, fetchImpl })).toBeNull();
  });
});
