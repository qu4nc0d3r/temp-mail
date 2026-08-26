import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfirmDialog from './ConfirmDialog.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ConfirmDialog', () => {
  it('renders title and message when open', () => {
    mount(ConfirmDialog, {
      props: { open: true, title: 'Delete mailbox', message: 'This cannot be undone.' },
    });
    // AppModal teleport vào body nên query document
    expect(document.body.textContent).toContain('Delete mailbox');
    expect(document.body.textContent).toContain('This cannot be undone.');
  });

  it('emits confirm when Delete permanently is clicked', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true } });
    const btn = document.querySelector<HTMLButtonElement>('.confirm-actions .danger');
    expect(btn).not.toBeNull();
    btn!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('emits cancel when Keep is clicked', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true } });
    const btn = document.querySelector<HTMLButtonElement>('.confirm-actions .ghost');
    btn!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
