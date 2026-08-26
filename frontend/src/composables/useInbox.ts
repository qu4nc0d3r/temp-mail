import { ref, computed, type Ref } from 'vue';
import { api } from '../api/client';
import type { Session } from './useMailbox';

export interface MessageSummary {
  id: string;
  from_name: string | null;
  from_addr: string;
  subject: string | null;
  preview: string;
  received_at: number;
}

const READ_STORAGE_KEY = 'tempmail.read';

function loadReadIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface Options {
  session: Ref<Session | null>;
  onNewMail: (newMessages: MessageSummary[]) => void;
  pollMs?: number;
}

export function useInbox({ session, onNewMail, pollMs = 5000 }: Options) {
  const messages = ref<MessageSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const readIds = ref<string[]>(loadReadIds());
  const seenIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const unreadCount = computed(() => messages.value.filter((m) => !readIds.value.includes(m.id)).length);

  function persistReadIds() {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(readIds.value));
  }

  function markRead(id: string) {
    if (!readIds.value.includes(id)) {
      readIds.value = [...readIds.value, id];
      persistReadIds();
    }
  }

  function isRead(id: string) {
    return readIds.value.includes(id);
  }

  function clearRead() {
    readIds.value = [];
    localStorage.removeItem(READ_STORAGE_KEY);
  }

  /** Xoá toàn bộ trạng thái inbox (mail, đã đọc, lỗi) — dùng khi mailbox bị xoá/hết hạn. */
  function reset() {
    messages.value = [];
    error.value = null;
    seenIds.clear();
    clearRead();
  }

  async function refresh() {
    const s = session.value;
    if (!s) return;
    loading.value = true;
    try {
      const res = await api.get<{ messages: MessageSummary[] }>(
        `/api/mailbox/${encodeURIComponent(s.address)}/messages`,
        { token: s.token },
      );
      // session đổi/xoá trong lúc đợi fetch (mailbox bị xoá/tạo mới) → bỏ kết quả cũ
      if (session.value !== s) return;
      error.value = null;
      const prev = new Set(messages.value.map((m) => m.id));
      const fresh = res.messages.filter((m) => !prev.has(m.id));
      messages.value = res.messages;
      for (const m of res.messages) seenIds.add(m.id);
      if (fresh.length > 0) onNewMail(fresh);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load inbox';
    } finally {
      loading.value = false;
    }
  }

  // Poll ngay cả khi tab ẩn: notifyNewMail tự quyết định chỉ notify lúc ẩn.
  // Trình duyệt sẽ throttle interval ở background tab, nhưng vẫn đủ để bắt mail mới.
  function start() {
    timer = setInterval(() => {
      void refresh();
    }, pollMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  return { messages, loading, error, unreadCount, readIds, markRead, isRead, clearRead, reset, refresh, start, stop };
}
