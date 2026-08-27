import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="mock-line" />' },
  // Bar mock renders its category labels as text so tests can observe chart wiring
  Bar: { props: ['data'], template: '<div class="mock-bar">{{ data.labels }}</div>' },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {}, LinearScale: class {}, PointElement: class {},
  LineElement: class {}, BarElement: class {}, Filler: class {},
  Tooltip: class {}, Legend: class {}, Title: class {},
}));

import AbuseView from './AbuseView.vue';

const events = {
  events: [{ id: 1, type: 'rate_limited', ip_hash: 'abcd1234', address: null, detail: null, created_at: 1_700_000_000_000 }],
  total: 1, limit: 20, offset: 0,
};

let fetchMock: MockInstance;

describe('AbuseView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/top')) return new Response(JSON.stringify({ by: 'senders', items: [{ label: 'spam@x.com', count: 5 }] }), { status: 200 });
      if (String(url).includes('/events')) return new Response(JSON.stringify(events), { status: 200 });
      if (String(url).includes('/overview')) return new Response(JSON.stringify({}), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });

  it('renders top senders and event feed', async () => {
    const wrapper = mount(AbuseView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('spam@x.com');
    expect(wrapper.text()).toContain('rate_limited');
  });

  it('includes config_changed in the event type filter', async () => {
    const wrapper = mount(AbuseView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const options = wrapper.findAll('select option').map((o) => o.text());
    expect(options).toContain('config_changed');
  });

  it('filters events by type and refetches with the type param', async () => {
    const wrapper = mount(AbuseView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);
    await select.setValue('rate_limited');
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events?type=rate_limited&limit=20&offset=0', expect.anything());
  });
});
