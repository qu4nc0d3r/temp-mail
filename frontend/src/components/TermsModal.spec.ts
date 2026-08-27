import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TermsModal from './TermsModal.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TermsModal', () => {
  it('shows the bilingual disclaimer and prohibited-use sections when open', () => {
    mount(TermsModal, { props: { open: true } });
    const body = document.body.textContent ?? '';
    expect(body).toContain('Miễn trừ trách nhiệm');
    expect(body).toContain('Disclaimer');
    expect(body).toContain('Hành vi bị nghiêm cấm');
  });

  it('cites Vietnamese cybersecurity law for prohibited uses', () => {
    mount(TermsModal, { props: { open: true } });
    const body = document.body.textContent ?? '';
    expect(body).toContain('Luật An ninh mạng 2018');
    expect(body).toContain('Nghị định 15/2020/NĐ-CP');
    expect(body).toContain('Bộ luật Hình sự');
    expect(body).toContain('Điều 290');
  });

  it('emits close when the close button is clicked', async () => {
    const wrapper = mount(TermsModal, { props: { open: true } });
    const btn = document.querySelector('.modal-close') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    await nextTick();
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
