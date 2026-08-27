declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export const RECAPTCHA_ACTION = 'create_mailbox';
const TOKEN_MAX_AGE_MS = 100_000; // reCAPTCHA tokens expire after ~2 min

let siteKeyPromise: Promise<string> | null = null;
let scriptPromise: Promise<void> | null = null;
let cachedToken: string | null = null;
let cachedTokenAt = 0;

async function fetchSiteKey(): Promise<string> {
  if (!siteKeyPromise) {
    siteKeyPromise = (async () => {
      try {
        const res = await fetch('/api/config');
        const data = (await res.json()) as { recaptchaSiteKey?: string };
        if (!data.recaptchaSiteKey) throw new Error('reCAPTCHA is not configured');
        return data.recaptchaSiteKey;
      } catch (e) {
        siteKeyPromise = null; // allow a later retry
        throw e;
      }
    })();
  }
  return siteKeyPromise;
}

function loadScript(key: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  if (window.grecaptcha) return Promise.resolve();
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load reCAPTCHA'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Returns a reCAPTCHA v3 token for the mailbox-creation action, fetching the
 * site key from /api/config and lazily loading the Google script. Fresh tokens
 * are cached and reused; once they age past the expiry window a new one is
 * executed.
 */
export async function getRecaptchaToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_MAX_AGE_MS) return cachedToken;

  let key: string;
  try {
    key = await fetchSiteKey();
  } catch {
    // Site key rỗng (recaptcha bị tắt từ admin) hoặc lỗi tải → không gửi token.
    // Backend tự quyết định: cờ recaptcha tắt → bỏ qua; cờ bật → từ chối fail-closed.
    return '';
  }
  if (!key) return '';

  if (!window.grecaptcha) await loadScript(key);

  const token = await new Promise<string>((resolve, reject) => {
    window.grecaptcha!.ready(async () => {
      try {
        resolve(await window.grecaptcha!.execute(key, { action: RECAPTCHA_ACTION }));
      } catch (e) {
        reject(e);
      }
    });
  });

  cachedToken = token;
  cachedTokenAt = Date.now();
  return token;
}

/** Clears cached state. Exposed for tests and to force a fresh token. */
export function resetRecaptchaState(): void {
  siteKeyPromise = null;
  scriptPromise = null;
  cachedToken = null;
  cachedTokenAt = 0;
}
