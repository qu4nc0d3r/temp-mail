<script setup lang="ts">
import AppModal from './AppModal.vue';
import MdiIcon from './MdiIcon.vue';
import { mdiTrashCanOutline } from '@mdi/js';

defineProps<{ open: boolean; title?: string; message?: string }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <AppModal :open="open" :title="title || 'Are you sure?'" size="sm" @close="emit('cancel')">
    <p v-if="message" class="confirm-msg">{{ message }}</p>
    <div class="confirm-actions">
      <button class="ghost" @click="emit('cancel')">Keep</button>
      <button class="danger" @click="emit('confirm')">
        <MdiIcon :path="mdiTrashCanOutline" :size="18" /> Delete permanently
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.confirm-msg { margin: 0 0 16px; color: var(--text-muted); }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.confirm-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 600;
}
.confirm-actions .ghost { border: 1px solid var(--border); color: var(--text); }
.confirm-actions .ghost:hover { background: var(--bg); }
.confirm-actions .danger { background: var(--danger); color: #fff; }
.confirm-actions .danger:hover { filter: brightness(1.08); }
</style>
