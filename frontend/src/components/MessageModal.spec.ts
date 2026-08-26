import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MessageModal from './MessageModal.vue';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('MessageModal', () => {
  it('fetches detail and renders sandboxed html', async () => {
    const detail = {
      id: 'm1', from_name: 'Alice', from_addr: 'a@x.com', subject: 'Hi', preview: 'p',
      html_body: '<b>Hello</b>', text_body: 'Hello', attachments_count: 0, received_at: Date.now(),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: detail }), { status: 200 }));
    const wrapper = mount(MessageModal, {
      props: {
        open: true,
        messageId: 'm1',
        session: { address: 'in@x.com', token: 't', expiresAt: Date.now() + 60_000 },
      },
    });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    // AppModal teleport vào body nên query document, không phải wrapper
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('');
    wrapper.unmount();
  });

  it('shows a skeleton while the message detail is loading', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // fetch không bao giờ resolve
    const wrapper = mount(MessageModal, {
      props: {
        open: true,
        messageId: 'm1',
        session: { address: 'in@x.com', token: 't', expiresAt: Date.now() + 60_000 },
      },
    });
    await nextTick();
    expect(document.querySelector('.skeleton-detail')).not.toBeNull();
    wrapper.unmount();
  });
});
