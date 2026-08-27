import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecaptchaToken, resetRecaptchaState } from './recaptcha';

function stubGrecaptcha(execute = vi.fn(async () => 'token-abc')) {
  (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: typeof execute } }).grecaptcha = {
    ready: (cb) => cb(),
    execute,
  };
}

function stubConfig(siteKey: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ recaptchaSiteKey: siteKey }), { status: 200 }));
}

beforeEach(() => {
  resetRecaptchaState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// happy-dom auto-loads appended <script> tags (and fires an error because the
// Google URL can't be fetched), so we stub element creation to drive the load
// event ourselves.
function stubScriptLoading() {
  let captured: { src?: string; onload?: () => void } | undefined;
  const originalCreate = document.createElement.bind(document);
  const appended: unknown[] = [];
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'script') {
      captured = {};
      return captured as unknown as HTMLScriptElement;
    }
    return originalCreate(tag);
  }) as Document['createElement']);
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    appended.push(node);
    return node;
  });
  return { getScript: () => captured, appended };
}

describe('getRecaptchaToken', () => {
  it('fetches the site key and executes reCAPTCHA', async () => {
    stubConfig('6Lc-test');
    const execute = vi.fn(async () => 'token-abc');
    stubGrecaptcha(execute);

    const token = await getRecaptchaToken();

    expect(token).toBe('token-abc');
    expect(execute).toHaveBeenCalledWith('6Lc-test', { action: 'create_mailbox' });
  });

  it('loads the reCAPTCHA script when grecaptcha is not yet present', async () => {
    stubConfig('6Lc-test');
    delete (window as unknown as Record<string, unknown>).grecaptcha;
    const { getScript, appended } = stubScriptLoading();

    const pending = getRecaptchaToken();

    // Let fetchSiteKey resolve so loadScript injects the <script> tag.
    await new Promise((r) => setTimeout(r, 0));
    const script = getScript();
    expect(script?.src).toContain('recaptcha/api.js?render=6Lc-test');
    expect(appended).toHaveLength(1);

    stubGrecaptcha();
    script?.onload?.();

    await expect(pending).resolves.toBe('token-abc');
  });

  it('returns an empty token when the site key is missing (recaptcha disabled)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ recaptchaSiteKey: '' }), { status: 200 }));
    await expect(getRecaptchaToken()).resolves.toBe('');
  });

  it('reuses a fresh cached token and re-executes after it expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    stubConfig('6Lc-test');
    const execute = vi.fn(async () => 'token-abc');
    stubGrecaptcha(execute);

    const first = await getRecaptchaToken();
    const second = await getRecaptchaToken();
    expect(second).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100_001);
    const third = await getRecaptchaToken();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(third).toBe('token-abc');
  });
});
