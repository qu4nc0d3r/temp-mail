<script setup lang="ts">
import { computed } from 'vue';
import MdiIcon from './MdiIcon.vue';
import { formatCountdown } from '../lib/format';
import {
  mdiContentCopy, mdiPlus, mdiClockOutline, mdiTrashCanOutline, mdiPencilOutline,
} from '@mdi/js';
import type { Session } from '../composables/useMailbox';

const props = defineProps<{
  session: Session | null;
  remainingMs: number;
}>();
const emit = defineEmits<{ copy: []; extend: []; remove: []; openCustom: [] }>();

const address = computed(() => props.session?.address ?? '');

const urgency = computed(() => {
  if (!props.session) return 'none';
  if (props.remainingMs < 2 * 60 * 1000) return 'danger';
  if (props.remainingMs < 5 * 60 * 1000) return 'warning';
  return 'ok';
});
</script>

<template>
  <section class="card address-card">
    <div class="address-card__top">
      <p class="label">YOUR TEMPORARY ADDRESS</p>
      <span class="countdown" :class="`countdown--${urgency}`">
        <MdiIcon :path="mdiClockOutline" :size="16" />
        Expires in {{ formatCountdown(remainingMs) }}
      </span>
    </div>
    <div class="address-row">
      <code class="address" :title="address">{{ address }}</code>
      <button class="copy-btn" aria-label="Copy address" @click="emit('copy')">
        <MdiIcon :path="mdiContentCopy" :size="18" />
        <span>Copy</span>
      </button>
    </div>
    <div class="actions">
      <button class="ghost-btn" @click="emit('extend')">
        <MdiIcon :path="mdiPlus" :size="18" /> +10 min
      </button>
      <button class="ghost-btn" @click="emit('openCustom')">
        <MdiIcon :path="mdiPencilOutline" :size="18" /> Custom
      </button>
      <button class="ghost-btn ghost-btn--danger" aria-label="Delete mailbox" @click="emit('remove')">
        <MdiIcon :path="mdiTrashCanOutline" :size="18" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.address-card { padding: clamp(14px, 4vw, 20px); }
.address-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 10px;
}
.label { margin: 0; font-size: 0.75rem; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
.address-row { display: flex; align-items: center; gap: 10px; }
.address {
  flex: 1;
  min-width: 0;
  font-size: clamp(1rem, 4vw, 1.2rem);
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  background: var(--accent);
  color: #fff;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  transition: filter 0.15s ease, transform 0.05s ease;
}
.copy-btn:hover { filter: brightness(1.08); }
.countdown {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.countdown--warning { color: var(--warning); }
.countdown--danger { color: var(--danger); font-weight: 600; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.85rem;
}
.ghost-btn:hover { background: var(--bg); }
.ghost-btn--danger:hover { color: var(--danger); border-color: var(--danger); }

/* mobile: hai nút chính trải đều, nút xoá thu gọn thành icon vuông */
@media (max-width: 639px) {
  .ghost-btn { flex: 1; justify-content: center; }
  .ghost-btn--danger { flex: 0 0 44px; width: 44px; }
}
</style>
