import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '../api/client';

export interface Session {
  address: string;
  token: string;
  expiresAt: number;
}

const STORAGE_KEY = 'tempmail.session';

function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (!s.address || !s.token || s.expiresAt <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function useMailbox() {
  const session = ref<Session | null>(loadSession());
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;

  const remainingMs = computed(() => (session.value ? session.value.expiresAt - now.value : 0));
  const expired = computed(() => !session.value || remainingMs.value <= 0);

  function startTicking() {
    now.value = Date.now();
    timer = setInterval(() => { now.value = Date.now(); }, 1000);
  }

  function persist(s: Session) {
    session.value = s;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  async function create(custom?: string) {
    const res = await api.post<{ address: string; token: string; expiresAt: number }>(
      '/api/mailbox',
      custom ? { custom } : {},
    );
    persist({ address: res.address, token: res.token, expiresAt: res.expiresAt });
  }

  async function extend() {
    if (!session.value) return;
    const res = await api.post<{ expiresAt: number }>(
      `/api/mailbox/${encodeURIComponent(session.value.address)}/extend`,
      undefined,
      { token: session.value.token },
    );
    persist({ ...session.value, expiresAt: res.expiresAt });
  }

  async function remove() {
    if (!session.value) return;
    await api.del(`/api/mailbox/${encodeURIComponent(session.value.address)}`, { token: session.value.token });
    clear();
  }

  function clear() {
    session.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  onMounted(startTicking);
  onUnmounted(() => { if (timer) clearInterval(timer); });

  return { session, remainingMs, expired, create, extend, remove, clear };
}
