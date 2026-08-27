import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminLogin from './AdminLogin.vue';
import { getAdminToken, setAdminToken } from './session';

describe('AdminLogin', () => {
  beforeEach(() => {
    setAdminToken(null);
    vi.restoreAllMocks();
  });

  it('hiển thị form đăng nhập', () => {
    const wrapper = mount(AdminLogin);
    expect(wrapper.text()).toContain('Khóa quản trị');
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it('đăng nhập sai hiển thị lỗi', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }), {
        status: 401, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const wrapper = mount(AdminLogin);
    await wrapper.find('input').setValue('sai-khoa');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('Sai khóa quản trị');
  });

  it('đăng nhập đúng set session', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'tk', expiresAt: Date.now() + 7200_000, serverTime: Date.now() }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const wrapper = mount(AdminLogin);
    await wrapper.find('input').setValue('dung-khoa');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 20));
    expect(getAdminToken()).toBe('tk');
  });
});
