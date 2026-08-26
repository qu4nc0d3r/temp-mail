import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

import MailboxView from './MailboxView.vue';

const mailboxes = {
  mailboxes: [{ address: 'a@toolviet.net', created_at: 1_700_000_000_000, expires_at: 1_700_000_600_000 }],
  total: 1, limit: 20, offset: 0,
};

describe('MailboxView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mailboxes), { status: 200 }));
  });

  it('renders mailbox rows', async () => {
    const wrapper = mount(MailboxView, { props: { refreshTick: 0 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('a@toolviet.net');
    expect(wrapper.text()).toContain('Tổng: 1');
  });
});
