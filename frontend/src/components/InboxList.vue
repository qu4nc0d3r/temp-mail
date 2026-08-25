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
}>();
const emit = defineEmits<{ 'open-message': [id: string]; refresh: [] }>();

const unreadCount = computed(() => props.messages.length);
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
      <li v-for="m in props.messages" :key="m.id" class="inbox__item" @click="emit('open-message', m.id)">
        <div class="inbox__meta">
          <strong class="inbox__sender">{{ m.from_name || m.from_addr }}</strong>
          <time class="inbox__time">{{ formatRelativeTime(m.received_at) }}</time>
        </div>
        <p class="inbox__subject">{{ m.subject || '(no subject)' }}</p>
        <p class="inbox__preview">{{ m.preview }}</p>
      </li>
    </ul>

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
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.inbox__item:last-child { border-bottom: none; }
.inbox__item:hover { background: var(--bg); }
.inbox__meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.inbox__sender { font-size: 0.95rem; }
.inbox__time { color: var(--text-muted); font-size: 0.8rem; white-space: nowrap; }
.inbox__subject { margin: 2px 0; font-size: 0.9rem; }
.inbox__preview { margin: 0; color: var(--text-muted); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 16px; color: var(--text-muted); text-align: center; }
.empty p { margin: 0; }
.empty__hint { font-size: 0.85rem; }
</style>
