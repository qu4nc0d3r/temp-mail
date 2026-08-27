import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { mount } from '@vue/test-utils';

import MessagesView from './MessagesView.vue';

const messages = {
  messages: [
    { id: 'm1', mailbox: 'a@x.com', from_name: 'Alice', from_addr: 'alice@x.com', subject: 'Hello', preview: 'p', received_at: 3000 },
    { id: 'm2', mailbox: 'b@x.com', from_name: 'Bob', from_addr: 'bob@x.com', subject: 'Report', preview: 'p', received_at: 2000 },
  ],
  total: 2, limit: 20, offset: 0,
};

const detail = {
  message: {
    id: 'm1', mailbox: 'a@x.com', from_name: 'Alice', from_addr: 'alice@x.com',
    subject: 'Hello', preview: 'p', html_body: '<p>hi</p>', text_body: 'hi',
    attachments_count: 0, received_at: 3000,
  },
};

function listCalls(mock: MockInstance): string[] {
  return mock.mock.calls
    .map(([u]) => String(u))
    .filter((u) => u.includes('/api/admin/messages?'));
}

let fetchMock: MockInstance;

describe('MessagesView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/admin/messages/')) return new Response(JSON.stringify(detail), { status: 200 });
      if (u.includes('/api/admin/messages')) return new Response(JSON.stringify(messages), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });

  it('renders the message table', async () => {
    const wrapper = mount(MessagesView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('alice@x.com');
    expect(wrapper.text()).toContain('Report');
    expect(wrapper.text()).toContain('b@x.com');
  });

  it('debounces the search box and refetches with the q param', async () => {
    const wrapper = mount(MessagesView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.find('input[type="search"]').setValue('alice');
    await new Promise((r) => setTimeout(r, 400));
    const calls = listCalls(fetchMock);
    expect(calls[calls.length - 1]).toContain('q=alice');
  });

  it('filters by mailbox when a mailbox cell is clicked', async () => {
    const wrapper = mount(MessagesView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.find('.mailbox-link').trigger('click');
    await new Promise((r) => setTimeout(r, 20));
    const calls = listCalls(fetchMock);
    expect(calls[calls.length - 1]).toContain(`mailbox=${encodeURIComponent('a@x.com')}`);
  });

  it('opens the detail modal on row click and fetches the body', async () => {
    const wrapper = mount(MessagesView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.find('tbody tr').trigger('click');
    await new Promise((r) => setTimeout(r, 20));
    const detailCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/api/admin/messages/m1'));
    expect(detailCall).toBeTruthy();
  });

  it('sorts by the clicked column header', async () => {
    const wrapper = mount(MessagesView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    await wrapper.find('.th-sort').trigger('click'); // from_addr, chưa active → asc
    await new Promise((r) => setTimeout(r, 20));
    const calls = listCalls(fetchMock);
    expect(calls[calls.length - 1]).toContain('sortBy=from_addr');
    expect(calls[calls.length - 1]).toContain('order=asc');
  });
});
