<script setup lang="ts">
import { ref, watch } from 'vue';
import MdiIcon from './MdiIcon.vue';
import AppModal from './AppModal.vue';
import { mdiAccountOutline, mdiClockOutline, mdiPaperclip } from '@mdi/js';
import { api } from '../api/client';
import { buildSrcdoc } from '../lib/sandbox';
import { formatRelativeTime } from '../lib/format';
import type { Session } from '../composables/useMailbox';

interface MessageDetail {
  id: string;
  from_name: string | null;
  from_addr: string;
  subject: string | null;
  preview: string;
  html_body: string | null;
  text_body: string | null;
  attachments_count: number;
  received_at: number;
}

const props = defineProps<{ open: boolean; messageId: string | null; session: Session | null }>();
const emit = defineEmits<{ close: [] }>();

const detail = ref<MessageDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const srcdoc = ref('');

watch(
  () => [props.open, props.messageId],
  async () => {
    if (!props.open || !props.messageId || !props.session) return;
    loading.value = true;
    error.value = null;
    detail.value = null;
    srcdoc.value = '';
    try {
      const res = await api.get<{ message: MessageDetail }>(
        `/api/mailbox/${encodeURIComponent(props.session.address)}/messages/${props.messageId}`,
        { token: props.session.token },
      );
      detail.value = res.message;
      if (res.message.html_body) srcdoc.value = buildSrcdoc(res.message.html_body);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load message';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppModal :open="props.open" :title="detail?.subject || 'Message'" size="lg" @close="emit('close')">
    <div v-if="loading" class="skeleton-detail" aria-hidden="true">
      <span class="skeleton skeleton--title"></span>
      <div class="skeleton-meta">
        <span class="skeleton skeleton--meta"></span>
        <span class="skeleton skeleton--meta"></span>
      </div>
      <span class="skeleton skeleton--body"></span>
      <span class="skeleton skeleton--body"></span>
      <span class="skeleton skeleton--body skeleton--body-short"></span>
    </div>
    <div v-else-if="error" class="state state--error">{{ error }}</div>
    <template v-else-if="detail">
      <div class="detail-meta">
        <span class="meta-item"><MdiIcon :path="mdiAccountOutline" :size="16" /> {{ detail.from_name || detail.from_addr }}</span>
        <span class="meta-item"><MdiIcon :path="mdiClockOutline" :size="16" /> {{ formatRelativeTime(detail.received_at) }}</span>
        <span v-if="detail.attachments_count" class="meta-item"><MdiIcon :path="mdiPaperclip" :size="16" /> {{ detail.attachments_count }} attachment(s) not stored</span>
      </div>
      <iframe
        v-if="srcdoc"
        class="mail-frame"
        :srcdoc="srcdoc"
        sandbox=""
        title="Message content"
      ></iframe>
      <pre v-else class="mail-text">{{ detail.text_body }}</pre>
    </template>
  </AppModal>
</template>

<style scoped>
.state { display: flex; align-items: center; gap: 8px; color: var(--text-muted); padding: 24px 0; }
.state--error { color: var(--danger); }
.skeleton-detail { display: flex; flex-direction: column; gap: 12px; }
.skeleton-meta { display: flex; gap: 14px; }
.skeleton {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--border) 25%, var(--bg) 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}
.skeleton--title { height: 18px; width: 55%; }
.skeleton--meta { width: 90px; }
.skeleton--body { height: 14px; }
.skeleton--body-short { width: 70%; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.detail-meta { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; color: var(--text-muted); font-size: 0.85rem; }
.meta-item { display: inline-flex; align-items: center; gap: 6px; }
.mail-frame {
  width: 100%;
  height: min(60vh, 560px);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: #111;
}
.mail-text {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  max-height: 60vh;
  overflow-y: auto;
}
</style>
