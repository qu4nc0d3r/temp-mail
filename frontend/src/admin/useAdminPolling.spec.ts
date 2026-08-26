import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useAdminPolling } from './useAdminPolling';

describe('useAdminPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function host(fetcher: () => Promise<{ n: number }>, intervalMs?: number) {
    return defineComponent({
      setup() {
        const poll = useAdminPolling(fetcher, intervalMs);
        return () =>
          h('div', { id: 'host' }, [
            h('span', { 'data-test': 'data' }, JSON.stringify(poll.data.value)),
            h('span', { 'data-test': 'loading' }, String(poll.loading.value)),
            h('span', { 'data-test': 'error' }, poll.error.value ?? ''),
            h('button', { 'data-test': 'refresh', onClick: () => { void poll.refresh(); } }),
          ]);
      },
    });
  }

  it('fetches immediately on mount and exposes data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 42 });
    const wrapper = mount(host(fetcher));
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-test="data"]').text()).toContain('42');
    expect(wrapper.get('[data-test="loading"]').text()).toBe('false');
    expect(wrapper.get('[data-test="error"]').text()).toBe('');
  });

  it('exposes refresh() for manual reloads', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const wrapper = mount(host(fetcher));
    await flushPromises();
    fetcher.mockResolvedValue({ n: 2 });
    await wrapper.get('[data-test="refresh"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="data"]').text()).toContain('2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('sets error message when fetcher rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mount(host(fetcher));
    await flushPromises();
    expect(wrapper.get('[data-test="error"]').text()).toContain('boom');
    expect(wrapper.get('[data-test="loading"]').text()).toBe('false');
  });

  it('polls again after intervalMs while mounted', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const wrapper = mount(host(fetcher, 1000));
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('stops polling after unmount', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const wrapper = mount(host(fetcher, 1000));
    await flushMicrotasks();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

async function flushMicrotasks() {
  // flush the onMounted refresh chain (two awaits + .finally) without relying on timers
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
