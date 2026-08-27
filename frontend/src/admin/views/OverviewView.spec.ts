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

import OverviewView from './OverviewView.vue';
import type { AdminOverview } from '../../api/admin';

const overview: AdminOverview = {
  activeMailboxes: 12, messages24h: 340, mailPerMinute: 0.24, mailboxesCreated24h: 5,
  rateLimited24h: 3, rateLimited7d: 30, recaptchaFailed24h: 1, recaptchaFailed7d: 8,
  lastCronRunAt: Date.now() - 60_000,
  lastCronCleanup: { deletedMailboxes: 2, deletedMessages: 10 },
  serverTime: Date.now(),
};

describe('OverviewView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/overview')) return new Response(JSON.stringify(overview), { status: 200 });
      if (String(input).includes('/stats')) return new Response(JSON.stringify({ range: '24h', points: [] }), { status: 200 });
      if (String(input).includes('/config')) return new Response(JSON.stringify({
        domain: 'toolviet.net',
        devBypassEnabled: false,
        features: [
          { key: 'recaptcha', enabled: true, isDefault: true },
          { key: 'mailbox_create', enabled: true, isDefault: true },
          { key: 'rate_limit', enabled: true, isDefault: true },
          { key: 'custom_name', enabled: true, isDefault: true },
        ],
      }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });

  it('shows KPI values and cron health', async () => {
    const wrapper = mount(OverviewView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('Mailbox đang hoạt động');
    expect(wrapper.text()).toContain('cron cuối');
  });
});
