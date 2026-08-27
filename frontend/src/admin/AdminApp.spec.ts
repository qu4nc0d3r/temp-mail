import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line" />' },
  Bar: { template: '<div class="mock-bar" />' },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {}, LinearScale: class {}, PointElement: class {},
  LineElement: class {}, BarElement: class {}, Filler: class {},
  Tooltip: class {}, Legend: class {}, Title: class {},
}));

import AdminApp from './AdminApp.vue';
import { setAdminToken } from './session';

describe('AdminApp', () => {
  beforeEach(() => {
    setAdminToken('test-session');
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ domain: 'toolviet.net', recaptchaEnabled: true, devBypassEnabled: false }), { status: 200 }),
    );
  });

  it('renders the shell with Vietnamese nav', async () => {
    const wrapper = mount(AdminApp);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.text()).toContain('Tổng quan');
    expect(wrapper.text()).toContain('Mailbox');
    expect(wrapper.text()).toContain('Messages');
    expect(wrapper.text()).toContain('Lạm dụng');
    expect(wrapper.text()).toContain('Cấu hình');
  });

  it('switches the active view when a nav item is clicked', async () => {
    const wrapper = mount(AdminApp);
    await new Promise((r) => setTimeout(r, 0));
    const navButtons = wrapper.findAll('.admin-nav__item');
    expect(navButtons).toHaveLength(5);
    // overview is active by default
    expect(wrapper.find('.admin-view h2').text()).toBe('Tổng quan');
    await navButtons[1].trigger('click');
    expect(wrapper.find('.admin-view h2').text()).toBe('Mailbox');
    expect(navButtons[1].classes()).toContain('admin-nav__item--active');
  });

  it('hiển thị màn hình đăng nhập khi chưa có session', () => {
    setAdminToken(null);
    const wrapper = mount(AdminApp);
    expect(wrapper.text()).toContain('Khóa quản trị');
  });
});
