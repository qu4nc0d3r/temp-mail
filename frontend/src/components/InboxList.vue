<script setup lang="ts">
import { computed } from 'vue';
import MdiIcon from './MdiIcon.vue';
import { mdiEmailOutline, mdiRefresh, mdiInboxOutline } from '@mdi/js';
import { formatRelativeTime } from '../lib/format';
import type { MessageSummary } from '../composables/useInbox';

const props = defineProps<{
  messages: MessageSummary[];
  loading: boolean;
  expired: boolean;
  readIds: string[];
}>();
const emit = defineEmits<{ 'open-message': [id: string]; refresh: [] }>();

const unreadCount = computed(() => props.messages.filter((m) => !props.readIds.includes(m.id)).length);
</script>

<template>
  <section class="card inbox">
    <header class="inbox__header">
      <h2 class="inbox__title"><MdiIcon :path="mdiEmailOutline" :size="20" /> INBOX ({{ unreadCount }})</h2>
      <button class="icon-btn" aria-label="Refresh" :disabled="loading" @click="emit('refresh')">
        <MdiIcon :path="mdiRefresh" :size="20" />
      </button>
    </header>

    <div v-if="expired" class="empty">
      <MdiIcon :path="mdiInboxOutline" :size="32" />
      <p>This mailbox has expired.</p>
    </div>

    <ul v-else-if="props.messages.length" class="inbox__list">
      <li
        v-for="m in props.messages"
        :key="m.id"
        class="inbox__item"
        :class="{ 'inbox__item--unread': !props.readIds.includes(m.id) }"
        tabindex="0"
        role="button"
        @click="emit('open-message', m.id)"
        @keydown.enter.prevent="emit('open-message', m.id)"
        @keydown.space.prevent="emit('open-message', m.id)"
      >
        <div class="inbox__meta">
          <strong class="inbox__sender">{{ m.from_name || m.from_addr }}</strong>
          <time class="inbox__time">{{ formatRelativeTime(m.received_at) }}</time>
        </div>
        <p class="inbox__subject">{{ m.subject || '(no subject)' }}</p>
        <p class="inbox__preview">{{ m.preview }}</p>
      </li>
    </ul>

    <!-- đang load mail lần đầu → skeleton, đừng hiện "No mail yet" -->
    <div v-else-if="loading" class="skeleton-list" aria-hidden="true">
      <div v-for="i in 4" :key="i" class="skeleton-row">
        <span class="skeleton skeleton--dot"></span>
        <span class="skeleton skeleton--line skeleton--line-sm"></span>
        <span class="skeleton skeleton--line"></span>
        <span class="skeleton skeleton--line skeleton--line-lg"></span>
      </div>
    </div>

    <div v-else class="empty">
      <MdiIcon :path="mdiInboxOutline" :size="32" />
      <p>No mail yet — waiting for messages…</p>
      <p class="empty__hint">Send an email to this address and it will appear here.</p>
    </div>
  </section>
</template>

<style scoped>
.inbox { overflow: hidden; margin-top: 16px; }
.inbox__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.inbox__title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 0.9rem; letter-spacing: 0.05em; }
.icon-btn { color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; }
.icon-btn:disabled { opacity: 0.4; }
.inbox__list { list-style: none; margin: 0; padding: 0; }
.inbox__item {
  position: relative;
  padding: 14px 16px 14px 24px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.inbox__item:last-child { border-bottom: none; }
.inbox__item:hover { background: var(--bg); }
.inbox__item--unread::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.inbox__item--unread .inbox__subject { font-weight: 600; }
.inbox__meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.inbox__sender {
  font-size: 0.95rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inbox__time { color: var(--text-muted); font-size: 0.8rem; white-space: nowrap; }
.inbox__subject { margin: 2px 0; font-size: 0.9rem; }
.inbox__preview { margin: 0; color: var(--text-muted); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 16px; color: var(--text-muted); text-align: center; }
.empty p { margin: 0; }
.empty__hint { font-size: 0.85rem; }

/* focus keyboard cho inbox item */
.inbox__item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.skeleton-list { padding: 4px 0; }
.skeleton-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.skeleton--dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.skeleton--line-sm { width: 30%; }
.skeleton--line { flex: 1; }
.skeleton--line-lg { width: 80%; }
</style>
