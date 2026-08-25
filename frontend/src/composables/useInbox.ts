import { ref, type Ref } from 'vue';
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

interface Options {
  session: Ref<Session | null>;
  onNewMail: (newMessages: MessageSummary[]) => void;
  pollMs?: number;
}

export function useInbox({ session, onNewMail, pollMs = 5000 }: Options) {
  const messages = ref<MessageSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const seenIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh() {
    const s = session.value;
    if (!s) return;
    loading.value = true;
    try {
      const res = await api.get<{ messages: MessageSummary[] }>(
        `/api/mailbox/${encodeURIComponent(s.address)}/messages`,
        { token: s.token },
      );
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

  function start() {
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
  }

  return { messages, loading, error, refresh, start, stop };
}
