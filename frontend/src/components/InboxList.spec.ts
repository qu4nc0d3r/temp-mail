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
});
