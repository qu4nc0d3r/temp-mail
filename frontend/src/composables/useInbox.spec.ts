import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useInbox } from './useInbox';

describe('useInbox', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const session = ref({ address: 'a@x.com', token: 'tok', expiresAt: Date.now() + 10 * 60 * 1000 });

  it('fetches messages on refresh', async () => {
    const messages = [{ id: 'm1', from_name: 'A', from_addr: 'a@x', subject: 'S', preview: 'p', received_at: Date.now() }];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages }), { status: 200 }));
    const inbox = useInbox({ session, onNewMail: () => {} });
    await inbox.refresh();
    expect(inbox.messages.value).toHaveLength(1);
    expect(inbox.loading.value).toBe(false);
    // dùng session.value.address (không phải undefined)
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('a%40x.com');
  });

  it('polls every 5s and calls onNewMail for new ids', async () => {
    let url = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      url += 1;
      const messages = [{ id: `m${url}`, from_name: 'A', from_addr: 'a@x', subject: 'S', preview: 'p', received_at: Date.now() }];
      return new Response(JSON.stringify({ messages }), { status: 200 });
    });
    const onNew = vi.fn();
    const inbox = useInbox({ session, onNewMail: onNew });
    await inbox.refresh();
    expect(onNew).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    await inbox.refresh();
    expect(onNew).toHaveBeenCalledTimes(2);
    inbox.stop();
  });

  it('no-op when session is null', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    const nullSession = ref(null);
    const inbox = useInbox({ session: nullSession, onNewMail: () => {} });
    await inbox.refresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
