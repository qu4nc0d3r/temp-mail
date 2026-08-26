import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import AppModal from './AppModal.vue';

const Host = defineComponent({
  components: { AppModal },
  template: `
    <div>
      <button id="trigger" @click="open = true">Open</button>
      <AppModal :open="open" title="Dialog" @close="open = false">
        <button id="a">Action A</button>
        <button id="b">Action B</button>
      </AppModal>
    </div>
  `,
  setup() {
    const open = ref(false);
    return { open };
  },
});

function focusablesInModal() {
  const card = document.querySelector('.modal-card');
  return card
    ? Array.from(card.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])'))
    : [];
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AppModal focus management', () => {
  it('moves focus into the modal when it opens', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    await wrapper.find('#trigger').trigger('click');
    await nextTick();
    const card = document.querySelector('.modal-card');
    expect(card).not.toBeNull();
    expect(card!.contains(document.activeElement)).toBe(true);
    wrapper.unmount();
  });

  it('cycles focus back to the start when Tabbing from the last element', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    await wrapper.find('#trigger').trigger('click');
    await nextTick();
    const focusables = focusablesInModal();
    expect(focusables.length).toBeGreaterThan(1);
    focusables[focusables.length - 1].focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(focusables[0]);
    wrapper.unmount();
  });

  it('cycles focus to the last element when Shift+Tabbing from the first', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    await wrapper.find('#trigger').trigger('click');
    await nextTick();
    const focusables = focusablesInModal();
    focusables[0].focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    wrapper.unmount();
  });

  it('restores focus to the trigger when closed via Escape', async () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const trigger = wrapper.find('#trigger');
    (trigger.element as HTMLElement).focus(); // người dùng thật focus nút trước khi bấm (happy-dom không tự focus khi click)
    await trigger.trigger('click');
    await nextTick();
    expect(document.activeElement).not.toBe(trigger.element);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });
});
