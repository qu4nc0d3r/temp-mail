import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import InboxList from './InboxList.vue';

function makeMessage(id: string) {
  return { id, from_name: 'A', from_addr: 'a@x', subject: 'S', preview: 'p', received_at: Date.now() };
}

describe('InboxList', () => {
  it('shows only the unread count in the header', () => {
    const wrapper = mount(InboxList, {
      props: {
        messages: [makeMessage('m1'), makeMessage('m2'), makeMessage('m3')],
        loading: false,
        expired: false,
        readIds: ['m2'],
      },
    });
    expect(wrapper.text()).toContain('INBOX (2)');
  });

  it('marks unread items with a class and read items without', () => {
    const wrapper = mount(InboxList, {
      props: {
        messages: [makeMessage('m1'), makeMessage('m2')],
        loading: false,
        expired: false,
        readIds: ['m2'],
      },
    });
    const items = wrapper.findAll('.inbox__item');
    expect(items).toHaveLength(2);
    expect(items[0].classes()).toContain('inbox__item--unread');
    expect(items[1].classes()).not.toContain('inbox__item--unread');
  });

  it('emits open-message when an item is clicked', async () => {
    const wrapper = mount(InboxList, {
      props: {
        messages: [makeMessage('m1')],
        loading: false,
        expired: false,
        readIds: [],
      },
    });
    await wrapper.find('.inbox__item').trigger('click');
    expect(wrapper.emitted('open-message')?.[0]).toEqual(['m1']);
  });

  it('shows skeleton rows while loading with no messages', () => {
    const wrapper = mount(InboxList, {
      props: { messages: [], loading: true, expired: false, readIds: [] },
    });
    expect(wrapper.find('.skeleton-list').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No mail yet');
  });

  it('shows the empty state when not loading', () => {
    const wrapper = mount(InboxList, {
      props: { messages: [], loading: false, expired: false, readIds: [] },
    });
    expect(wrapper.find('.skeleton-list').exists()).toBe(false);
    expect(wrapper.text()).toContain('No mail yet');
  });

  it('renders each message item as keyboard-focusable', () => {
    const wrapper = mount(InboxList, {
      props: { messages: [makeMessage('m1')], loading: false, expired: false, readIds: [] },
    });
    expect(wrapper.find('.inbox__item').attributes('tabindex')).toBe('0');
  });

  it('opens a message with the Enter key', async () => {
    const wrapper = mount(InboxList, {
      props: { messages: [makeMessage('m1')], loading: false, expired: false, readIds: [] },
    });
    await wrapper.find('.inbox__item').trigger('keydown.enter');
    expect(wrapper.emitted('open-message')?.[0]).toEqual(['m1']);
  });

  it('opens a message with the Space key', async () => {
    const wrapper = mount(InboxList, {
      props: { messages: [makeMessage('m1')], loading: false, expired: false, readIds: [] },
    });
    await wrapper.find('.inbox__item').trigger('keydown.space');
    expect(wrapper.emitted('open-message')?.[0]).toEqual(['m1']);
  });
});
