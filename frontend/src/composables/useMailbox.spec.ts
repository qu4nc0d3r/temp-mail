import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useMailbox } from './useMailbox';

const storage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
};

function mountMailbox() {
  const Host = defineComponent({
    setup() {
      return { mb: useMailbox() };
    },
    template: '<div></div>',
  });
  return mount(Host);
}

describe('useMailbox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    globalThis.localStorage = storage() as unknown as Storage;
  });
  afterEach(() => vi.useRealTimers());

  it('creates a session and persists it', async () => {
    const createRes = { address: 'abc@x.com', token: 't'.repeat(64), expiresAt: Date.now() + 10 * 60 * 1000, serverTime: Date.now() };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(createRes), { status: 201 }));
    const wrapper = mountMailbox();
    const mb = wrapper.vm.mb;
    expect(mb.expired.value).toBe(true);
    await mb.create();
    expect(mb.session.value?.address).toBe('abc@x.com');
    expect(mb.expired.value).toBe(false);
    expect(globalThis.localStorage.getItem('tempmail.session')).toContain('abc@x.com');
    wrapper.unmount();
  });

  it('restores session from storage and counts down', async () => {
    const expiresAt = Date.now() + 10 * 60 * 1000;
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({ address: 'z@x.com', token: 't', expiresAt }));
    const wrapper = mountMailbox();
    await nextTick();
    const mb = wrapper.vm.mb;
    expect(mb.session.value?.address).toBe('z@x.com');
    const before = mb.remainingMs.value;
    expect(before).toBeGreaterThan(0);
    vi.advanceTimersByTime(1000);
    expect(mb.remainingMs.value).toBe(before - 1000);
    wrapper.unmount();
  });

  it('ignores expired stored session', () => {
    globalThis.localStorage.setItem('tempmail.session', JSON.stringify({ address: 'z@x.com', token: 't', expiresAt: Date.now() - 1 }));
    const wrapper = mountMailbox();
    expect(wrapper.vm.mb.session.value).toBeNull();
    wrapper.unmount();
  });
});
