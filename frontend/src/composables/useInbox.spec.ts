import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useInbox } from './useInbox';

describe('useInbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage.clear();
  });
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

  it('tracks read state and unreadCount', async () => {
    const messages = [
      { id: 'm1', from_name: 'A', from_addr: 'a@x', subject: 'S', preview: 'p', received_at: Date.now() },
      { id: 'm2', from_name: 'B', from_addr: 'b@x', subject: 'S', preview: 'p', received_at: Date.now() },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages }), { status: 200 }));
    const inbox = useInbox({ session, onNewMail: () => {} });
    await inbox.refresh();
    expect(inbox.unreadCount.value).toBe(2);

    inbox.markRead('m1');
    expect(inbox.isRead('m1')).toBe(true);
    expect(inbox.isRead('m2')).toBe(false);
    expect(inbox.unreadCount.value).toBe(1);

    inbox.markRead('m2');
    expect(inbox.unreadCount.value).toBe(0);
  });

  it('persists read ids to localStorage across instances', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    const inbox = useInbox({ session, onNewMail: () => {} });
    inbox.markRead('m42');
    expect(inbox.isRead('m42')).toBe(true);

    const reloaded = useInbox({ session, onNewMail: () => {} });
    expect(reloaded.isRead('m42')).toBe(true);
  });

  it('clearRead forgets all stored read ids', () => {
    const inbox = useInbox({ session, onNewMail: () => {} });
    inbox.markRead('m1');
    inbox.clearRead();
    expect(inbox.isRead('m1')).toBe(false);
    expect(JSON.parse(globalThis.localStorage.getItem('tempmail.read') || '[]')).toEqual([]);
  });

  it('reset clears messages, read state and unreadCount', async () => {
    const messages = [
      { id: 'm1', from_name: 'A', from_addr: 'a@x', subject: 'S', preview: 'p', received_at: Date.now() },
      { id: 'm2', from_name: 'B', from_addr: 'b@x', subject: 'S', preview: 'p', received_at: Date.now() },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messages }), { status: 200 }));
    const inbox = useInbox({ session, onNewMail: () => {} });
    await inbox.refresh();
    inbox.markRead('m1');
    expect(inbox.unreadCount.value).toBe(1);

    inbox.reset();
    expect(inbox.messages.value).toHaveLength(0);
    expect(inbox.unreadCount.value).toBe(0);
    expect(inbox.isRead('m1')).toBe(false);
    expect(globalThis.localStorage.getItem('tempmail.read')).toBeNull();
  });
});
