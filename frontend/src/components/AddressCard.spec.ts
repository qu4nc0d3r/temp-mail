import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AddressCard from './AddressCard.vue';

function makeSession() {
  return { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 600_000 };
}

describe('AddressCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits copy and shows Copied feedback for 1.5s', async () => {
    const wrapper = mount(AddressCard, { props: { session: makeSession(), remainingMs: 600_000 } });
    const btn = wrapper.find('.copy-btn');

    await btn.trigger('click');
    expect(wrapper.emitted('copy')).toHaveLength(1);
    expect(btn.text()).toContain('Copied');
    expect(btn.classes()).toContain('copy-btn--done');

    vi.advanceTimersByTime(1500);
    await vi.waitFor(() => {
      expect(btn.text()).toContain('Copy');
      expect(btn.classes()).not.toContain('copy-btn--done');
    });
  });

  it('shows the address and copy label initially', () => {
    const wrapper = mount(AddressCard, { props: { session: makeSession(), remainingMs: 600_000 } });
    expect(wrapper.text()).toContain('abc@x.com');
    expect(wrapper.find('.copy-btn').text()).toContain('Copy');
  });
});
