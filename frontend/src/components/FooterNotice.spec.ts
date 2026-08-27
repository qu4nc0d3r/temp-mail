import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FooterNotice from './FooterNotice.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FooterNotice', () => {
  it('renders the bilingual disclaimer summary', () => {
    const wrapper = mount(FooterNotice);
    expect(wrapper.text()).toContain('Nghiêm cấm sử dụng dịch vụ cho bất kỳ hoạt động bất hợp pháp');
    expect(wrapper.text()).toContain('Any illegal or criminal use is strictly prohibited');
    wrapper.unmount();
  });

  it('opens the full terms modal when the terms link is clicked', async () => {
    const wrapper = mount(FooterNotice);
    const link = wrapper.find('.footer-note__terms');
    expect(link.text()).toContain('Điều khoản sử dụng & Miễn trừ trách nhiệm');

    await link.trigger('click');
    await nextTick();

    const body = document.body.textContent ?? '';
    expect(body).toContain('Miễn trừ trách nhiệm');
    expect(body).toContain('Điều 290');
    wrapper.unmount();
  });
});
