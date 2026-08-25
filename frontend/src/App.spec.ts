import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

beforeEach(() => {
  globalThis.localStorage.clear();
  document.title = '';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('App', () => {
  it('creates a mailbox on mount when no session exists', async () => {
    const res = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000, serverTime: Date.now() };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(res), { status: 201 }));
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('abc@x.com');
    wrapper.unmount();
  });

  it('shows expired state when stored session is expired', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() - 1,
    }));
    const res = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000, serverTime: Date.now() };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(res), { status: 201 }));
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    // session hết hạn → App tự tạo mới và hiển thị địa chỉ mới (không còn expired banner)
    expect(wrapper.text()).toContain('abc@x.com');
    wrapper.unmount();
  });
});
