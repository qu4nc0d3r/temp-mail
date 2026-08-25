<script setup lang="ts">
import { computed } from 'vue';
import MdiIcon from './MdiIcon.vue';
import { formatCountdown } from '../lib/format';
import {
  mdiContentCopy, mdiPlus, mdiRefresh, mdiClockOutline, mdiTrashCanOutline, mdiPencilOutline,
} from '@mdi/js';
import type { Session } from '../composables/useMailbox';

const props = defineProps<{
  session: Session | null;
  remainingMs: number;
}>();
const emit = defineEmits<{ copy: []; extend: []; remove: []; openCustom: []; refresh: [] }>();

const address = computed(() => props.session?.address ?? '');
const localPart = computed(() => address.value.split('@')[0] ?? '');

const urgency = computed(() => {
  if (!props.session) return 'none';
  if (props.remainingMs < 2 * 60 * 1000) return 'danger';
  if (props.remainingMs < 5 * 60 * 1000) return 'warning';
  return 'ok';
});
</script>

<template>
  <section class="card address-card">
    <p class="label">YOUR TEMPORARY ADDRESS</p>
    <div class="address-row">
      <code class="address" :title="address">{{ address }}</code>
      <button class="icon-btn" aria-label="Copy address" @click="emit('copy')">
        <MdiIcon :path="mdiContentCopy" :size="20" />
      </button>
      <button class="icon-btn" aria-label="New address" @click="emit('refresh')">
        <MdiIcon :path="mdiRefresh" :size="20" />
      </button>
    </div>
    <div class="actions">
      <span class="countdown" :class="`countdown--${urgency}`">
        <MdiIcon :path="mdiClockOutline" :size="18" />
        Expires in {{ formatCountdown(remainingMs) }}
      </span>
      <div class="actions__btns">
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
    </div>
  </section>
</template>

<style scoped>
.address-card { padding: clamp(14px, 4vw, 20px); }
.label { margin: 0 0 8px; font-size: 0.75rem; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; font-weight: 600; }
.address-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.address {
  flex: 1;
  min-width: 0;
  font-size: clamp(0.95rem, 4vw, 1.15rem);
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { color: var(--text); background: var(--bg); }
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.countdown { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.countdown--warning { color: var(--warning); }
.countdown--danger { color: var(--danger); font-weight: 600; }
.actions__btns { display: flex; gap: 4px; flex-wrap: wrap; }
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
</style>
