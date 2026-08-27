import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';
import { resetRecaptchaState } from './lib/recaptcha';
import { resetPublicConfigCache } from './api/client';

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
  resetPublicConfigCache();
  stubGrecaptcha();
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
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

  it('creates a mailbox when recaptcha is disabled (empty site key)', async () => {
    const res = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000, serverTime: Date.now() };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '', features: { customName: true, mailboxCreate: true } }), { status: 200 });
      }
      return new Response(JSON.stringify(res), { status: 201 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('abc@x.com');
    const createCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/mailbox') && c[1]?.method === 'POST');
    expect(createCall).toBeDefined();
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

  it('shows the base favicon when there are no unread messages', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() + 600_000,
    }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });
    mount(App);
    await new Promise((r) => setTimeout(r, 0));
    const link = document.querySelector('link[rel="icon"]');
    expect(link).not.toBeNull();
    const svg = decodeURIComponent((link!.getAttribute('href') ?? '').replace('data:image/svg+xml,', ''));
    expect(svg).toContain('2f6bff');
    expect(svg).not.toContain('e5484d');
  });

  it('reflects unread count in title and marks a message read on open', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() + 600_000,
    }));
    const m1 = { id: 'm1', from_name: 'Alice', from_addr: 'a@x', subject: 'Hi', preview: 'p', received_at: Date.now() };
    const m2 = { id: 'm2', from_name: 'Bob', from_addr: 'b@x', subject: 'Yo', preview: 'p', received_at: Date.now() };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
      }
      if (/\/messages\/[^/]+$/.test(url)) {
        return new Response(JSON.stringify({ message: { ...m1, html_body: null, text_body: 'hello', attachments_count: 0 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [m1, m2] }), { status: 200 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));

    expect(document.title).toBe('(2) Temp Mail');
    const favicon = decodeURIComponent((document.querySelector('link[rel="icon"]')!.getAttribute('href') ?? '').replace('data:image/svg+xml,', ''));
    expect(favicon).toContain('e5484d');

    await wrapper.findAll('.inbox__item')[0].trigger('click');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.title).toBe('(1) Temp Mail');
    expect(JSON.parse(globalThis.localStorage.getItem('tempmail.read') || '[]')).toEqual(['m1']);
    wrapper.unmount();
  });

  it('clears read state, title and favicon badge when the mailbox is deleted', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() + 600_000,
    }));
    globalThis.localStorage.setItem('tempmail.read', JSON.stringify(['m1']));
    const m1 = { id: 'm1', from_name: 'Alice', from_addr: 'a@x', subject: 'Hi', preview: 'p', received_at: Date.now() };
    const m2 = { id: 'm2', from_name: 'Bob', from_addr: 'b@x', subject: 'Yo', preview: 'p', received_at: Date.now() };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
      }
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [m1, m2] }), { status: 200 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));

    // m1 đã đọc từ localStorage → còn 1 unread
    expect(document.title).toBe('(1) Temp Mail');

    await wrapper.find('.ghost-btn--danger').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector<HTMLButtonElement>('.confirm-actions .danger')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.title).toBe('Temp Mail');
    expect(globalThis.localStorage.getItem('tempmail.read')).toBeNull();
    const svg = decodeURIComponent((document.querySelector('link[rel="icon"]')!.getAttribute('href') ?? '').replace('data:image/svg+xml,', ''));
    expect(svg).not.toContain('e5484d');
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

  it('shows a maintenance banner and does not auto-create when mailbox_create is off', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '', features: { customName: false, mailboxCreate: false } }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('bảo trì');
    const createCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/mailbox') && c[1]?.method === 'POST');
    expect(createCall).toBeUndefined();
    wrapper.unmount();
  });

  it('shows the footer legal disclaimer', async () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({
      address: 'z@x.com', token: 't', expiresAt: Date.now() + 600_000,
    }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ recaptchaSiteKey: '6Lc-test' }), { status: 200 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });
    const wrapper = mount(App);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('Nghiêm cấm sử dụng dịch vụ cho bất kỳ hoạt động bất hợp pháp');
    expect(wrapper.text()).toContain('Điều khoản sử dụng & Miễn trừ trách nhiệm');
    wrapper.unmount();
  });
});
