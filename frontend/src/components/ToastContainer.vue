<script setup lang="ts">
import { useToast } from '../composables/useToast';
import MdiIcon from './MdiIcon.vue';
import { mdiCheckCircle, mdiAlertCircle, mdiAlert, mdiInformation, mdiClose } from '@mdi/js';

const { toasts, dismiss } = useToast();

const icons = {
  success: mdiCheckCircle,
  error: mdiAlertCircle,
  warning: mdiAlert,
  info: mdiInformation,
} as const;
</script>

<template>
  <div class="toast-container" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast--${t.type}`" role="status">
        <MdiIcon :path="icons[t.type]" :size="20" />
        <span class="toast__msg">{{ t.message }}</span>
        <button class="toast__close" aria-label="Dismiss" @click="dismiss(t.id)">
          <MdiIcon :path="mdiClose" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1000;
  max-width: min(90vw, 360px);
}
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: var(--shadow);
}
.toast--success { border-left-color: var(--success); }
.toast--error { border-left-color: var(--danger); }
.toast--warning { border-left-color: var(--warning); }
.toast__msg { flex: 1; font-size: 0.9rem; }
.toast__close { min-height: 0; min-width: 0; padding: 2px; color: var(--text-muted); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(12px); }
</style>
