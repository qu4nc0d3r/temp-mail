import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useMailbox } from './useMailbox';
import { resetRecaptchaState } from '../lib/recaptcha';

const RECAPTCHA_TOKEN = 'recaptcha-token-abc';

function stubGrecaptcha() {
  (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: () => Promise<string> } }).grecaptcha = {
    ready: (cb) => cb(),
    execute: async () => RECAPTCHA_TOKEN,
  };
}

function mockCreateFetch(createRes: object) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/api/config')) {
      return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
    }
    return new Response(JSON.stringify(createRes), { status: 201 });
  });
}

const storage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
};

function mountMailbox() {
  const Host = defineComponent({
    setup() {
      return { mb: useMailbox() };
    },
    template: '<div></div>',
  });
  return mount(Host);
}

describe('useMailbox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    globalThis.localStorage = storage() as unknown as Storage;
    resetRecaptchaState();
    stubGrecaptcha();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a session, sending a reCAPTCHA token, and persists it', async () => {
    const createRes = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 10 * 60 * 1000, serverTime: Date.now() };
    const fetchMock = mockCreateFetch(createRes);
    const wrapper = mountMailbox();
    const mb = wrapper.vm.mb;
    expect(mb.expired.value).toBe(true);
    await mb.create();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mailbox',
      expect.objectContaining({ body: JSON.stringify({ recaptchaToken: RECAPTCHA_TOKEN }) }),
    );
    expect(mb.session.value?.address).toBe('abc@x.com');
    expect(mb.expired.value).toBe(false);
    expect(globalThis.localStorage.getItem('tempmail.session')).toContain('abc@x.com');
    wrapper.unmount();
  });

  it('sends the custom name and a reCAPTCHA token when creating a custom mailbox', async () => {
    const createRes = { address: 'john@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 10 * 60 * 1000, serverTime: Date.now() };
    const fetchMock = mockCreateFetch(createRes);
    const wrapper = mountMailbox();
    await wrapper.vm.mb.create('john');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mailbox',
      expect.objectContaining({ body: JSON.stringify({ custom: 'john', recaptchaToken: RECAPTCHA_TOKEN }) }),
    );
    wrapper.unmount();
  });

  it('restores session from storage and counts down', async () => {
    const expiresAt = Date.now() + 10 * 60 * 1000;
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({ address: 'z@x.com', token: 't', expiresAt }));
    const wrapper = mountMailbox();
    await nextTick();
    const mb = wrapper.vm.mb;
    expect(mb.session.value?.address).toBe('z@x.com');
    const before = mb.remainingMs.value;
    expect(before).toBeGreaterThan(0);
    vi.advanceTimersByTime(1000);
    expect(mb.remainingMs.value).toBe(before - 1000);
    wrapper.unmount();
  });

  it('ignores expired stored session', () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({ address: 'z@x.com', token: 't', expiresAt: Date.now() - 1 }));
    const wrapper = mountMailbox();
    expect(wrapper.vm.mb.session.value).toBeNull();
    wrapper.unmount();
  });
});
