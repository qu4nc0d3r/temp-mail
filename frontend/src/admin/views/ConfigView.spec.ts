import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { mount } from '@vue/test-utils';

import ConfigView from './ConfigView.vue';

const features = [
  { key: 'recaptcha', enabled: true, isDefault: true },
  { key: 'mailbox_create', enabled: true, isDefault: true },
  { key: 'rate_limit', enabled: false, isDefault: false },
  { key: 'custom_name', enabled: true, isDefault: false },
];

let fetchMock: MockInstance;

describe('ConfigView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/admin/config') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ domain: 'x.com', devBypassEnabled: false, features }), { status: 200 });
      }
      if (u.includes('/api/admin/overview')) {
        return new Response(JSON.stringify({ lastCronRunAt: null, lastCronCleanup: null }), { status: 200 });
      }
      if (init?.method === 'PUT' || init?.method === 'DELETE') {
        return new Response(JSON.stringify({ features }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
  });

  it('renders a toggle per feature with default badge', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(4);
    expect(wrapper.text()).toContain('reCAPTCHA bảo vệ');
    expect(wrapper.text()).toContain('Giới hạn tốc độ');
    expect(wrapper.findAll('.badge--default').length).toBe(2);
  });

  it('turns a non-protective feature off without confirmation', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const switches = wrapper.findAll('[role="switch"]');
    await switches[3].trigger('click'); // custom_name đang bật → tắt trực tiếp
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features', expect.objectContaining({ method: 'PUT' }));
  });

  it('shows a confirm dialog before disabling a protective feature', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const switches = wrapper.findAll('[role="switch"]');
    await switches[0].trigger('click'); // recaptcha đang bật (protective) → confirm
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).toContain('reCAPTCHA bảo vệ');
    // chưa gọi PUT trước khi xác nhận
    const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('.confirm-actions .danger')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features', expect.objectContaining({ method: 'PUT' }));
  });

  it('resets a non-default feature', async () => {
    const wrapper = mount(ConfigView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const resetBtns = wrapper.findAll('.reset-btn');
    expect(resetBtns.length).toBe(2);
    await resetBtns[0].trigger('click');
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/config/features/rate_limit', expect.objectContaining({ method: 'DELETE' }));
  });
});
