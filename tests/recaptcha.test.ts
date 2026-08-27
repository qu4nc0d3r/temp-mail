import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env as testEnv } from 'cloudflare:test';
import { verifyRecaptcha, parseThreshold } from '../src/lib/recaptcha';
import worker from '../src/index';
import { setupDb } from './helpers/db';
import { setSetting } from '../src/db/queries';
import type { Env } from '../src/env';

const SITE_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { RECAPTCHA_SECRET_KEY: 'secret', RECAPTCHA_THRESHOLD: '0.5', ...overrides } as Env;
}

function mockFetch(payload: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(payload), { status }),
  );
}

describe('parseThreshold', () => {
  it('defaults to 0.5 when unset or invalid', () => {
    expect(parseThreshold(undefined)).toBe(0.5);
    expect(parseThreshold('abc')).toBe(0.5);
  });

  it('parses valid threshold', () => {
    expect(parseThreshold('0.7')).toBe(0.7);
  });
});

describe('verifyRecaptcha', () => {
  it('passes without calling Google when no secret is configured (disabled mode)', async () => {
    const fetchImpl = mockFetch({});
    const ok = await verifyRecaptcha(makeEnv({ RECAPTCHA_SECRET_KEY: '' }), '', undefined, fetchImpl);
    expect(ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails fast on an empty token when secret is configured', async () => {
    const fetchImpl = mockFetch({});
    const ok = await verifyRecaptcha(makeEnv(), '', undefined, fetchImpl);
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts secret, response and remoteip to siteverify and passes on valid response', async () => {
    const fetchImpl = mockFetch({ success: true, score: 0.9, action: 'create_mailbox' });
    const ok = await verifyRecaptcha(makeEnv(), 'token-123', '1.2.3.4', fetchImpl);
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SITE_VERIFY_URL);
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('token-123');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects when Google returns success=false', async () => {
    const fetchImpl = mockFetch({ success: false, 'error-codes': ['invalid-input-response'] });
    const ok = await verifyRecaptcha(makeEnv(), 'bad', undefined, fetchImpl);
    expect(ok).toBe(false);
  });

  it('rejects when the action does not match', async () => {
    const fetchImpl = mockFetch({ success: true, score: 0.9, action: 'other_action' });
    const ok = await verifyRecaptcha(makeEnv(), 't', undefined, fetchImpl);
    expect(ok).toBe(false);
  });

  it('rejects when score is below threshold', async () => {
    const fetchImpl = mockFetch({ success: true, score: 0.3, action: 'create_mailbox' });
    const ok = await verifyRecaptcha(makeEnv(), 't', undefined, fetchImpl);
    expect(ok).toBe(false);
  });

  it('respects an overridden threshold', async () => {
    const low = mockFetch({ success: true, score: 0.4, action: 'create_mailbox' });
    expect(await verifyRecaptcha(makeEnv({ RECAPTCHA_THRESHOLD: '0.3' }), 't', undefined, low)).toBe(true);
    const high = mockFetch({ success: true, score: 0.4, action: 'create_mailbox' });
    expect(await verifyRecaptcha(makeEnv({ RECAPTCHA_THRESHOLD: '0.5' }), 't', undefined, high)).toBe(false);
  });

  it('fails closed when the siteverify request throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); });
    const ok = await verifyRecaptcha(makeEnv(), 't', undefined, fetchImpl);
    expect(ok).toBe(false);
  });

  it('fails closed when siteverify returns a non-200 status', async () => {
    const fetchImpl = mockFetch({ success: true, score: 0.9, action: 'create_mailbox' }, 500);
    const ok = await verifyRecaptcha(makeEnv(), 't', undefined, fetchImpl);
    expect(ok).toBe(false);
  });
});

describe('route wiring', () => {
  beforeEach(async () => {
    await setupDb();
    // Re-use the reset D1 bindings from cloudflare:test with a non-empty secret
    // so the route enforces reCAPTCHA, while stubbing Google's siteverify.
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ success: true, score: 0.9, action: 'create_mailbox' }), { status: 200 }),
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  function makeRequest(body: unknown): Request {
    return new Request('https://example.com/api/mailbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function dispatch(body: unknown) {
    const mockEnv = { ...testEnv, RECAPTCHA_SECRET_KEY: 'secret' } as unknown as Env;
    return worker.fetch(makeRequest(body), mockEnv, {} as ExecutionContext);
  }

  it('rejects creation when the recaptcha token is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    ));
    const res = await dispatch({ custom: 'bob' });
    expect(res.status).toBe(403);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('RECAPTCHA_FAILED');
  });

  it('creates the mailbox when the recaptcha token is valid', async () => {
    const res = await dispatch({ custom: 'bob', recaptchaToken: 'tok' });
    expect(res.status).toBe(201);
  });

  it('skips recaptcha verification when the feature flag is off', async () => {
    await setSetting(testEnv.DB, 'feature.recaptcha', '0');
    const res = await dispatch({});
    expect(res.status).toBe(201);
  });

  it('rejects invalid recaptcha when the feature flag is on', async () => {
    await setSetting(testEnv.DB, 'feature.recaptcha', '1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
    const res = await dispatch({ recaptchaToken: 'tok' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/config', () => {
  beforeEach(async () => {
    await setupDb();
  });

  it('serves the site key and feature flags when recaptcha is enabled', async () => {
    await setSetting(testEnv.DB, 'feature.recaptcha', '1');
    const res = await SELF.fetch('https://example.com/api/config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      recaptchaSiteKey: 'test-site-key',
      features: { customName: true, mailboxCreate: true },
    });
  });

  it('hides the site key when recaptcha is off', async () => {
    const res = await SELF.fetch('https://example.com/api/config');
    expect(await res.json()).toEqual({
      recaptchaSiteKey: '',
      features: { customName: true, mailboxCreate: true },
    });
  });
});
