import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';
import { resetRecaptchaState } from './lib/recaptcha';

function stubGrecaptcha() {
  (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: () => Promise<string> } }).grecaptcha = {
    ready: (cb) => cb(),
    execute: async () => 'recaptcha-token-abc',
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

beforeEach(() => {
  globalThis.localStorage.clear();
  document.title = '';
  resetRecaptchaState();
  stubGrecaptcha();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('App', () => {
  it('creates a mailbox on mount when no session exists', async () => {
    const res = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000, serverTime: Date.now() };
    mockCreateFetch(res);
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('abc@x.com');
    wrapper.unmount();
  });

  it('deletes the mailbox through a confirm dialog', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() + 600_000,
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
      }
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));

    await wrapper.find('.ghost-btn--danger').trigger('click');
    await new Promise((r) => setTimeout(r, 0));

    // dialog teleport vào body — không dùng window.confirm nữa
    const confirmBtn = document.querySelector<HTMLButtonElement>('.confirm-actions .danger');
    expect(confirmBtn).not.toBeNull();
    expect(document.body.textContent).toContain('Delete permanently');
    confirmBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const deleteCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toContain('z%40x.com');
    expect(globalThis.localStorage.getItem('tempmail.session')).toBeNull();
    wrapper.unmount();
  });

  it('shows expired state when stored session is expired', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() - 1,
    }));
    const res = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000, serverTime: Date.now() };
    mockCreateFetch(res);
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    // session hết hạn → App tự tạo mới và hiển thị địa chỉ mới (không còn expired banner)
    expect(wrapper.text()).toContain('abc@x.com');
    wrapper.unmount();
  });
});
