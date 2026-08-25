<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import MdiIcon from './MdiIcon.vue';
import { mdiClose } from '@mdi/js';

const props = withDefaults(defineProps<{ open: boolean; title?: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="props.open" class="modal-backdrop" @click.self="emit('close')">
        <div class="modal-card" :class="`modal-card--${props.size}`" role="dialog" aria-modal="true">
          <header class="modal-header">
            <h2 class="modal-title">{{ props.title }}</h2>
            <button class="modal-close" aria-label="Close" @click="emit('close')">
              <MdiIcon :path="mdiClose" :size="20" />
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 22, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 900;
  padding: 0;
}
.modal-card {
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}
.modal-card--sm { max-width: 400px; }
.modal-card--md { max-width: 640px; }
.modal-card--lg { max-width: 860px; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-title { margin: 0; font-size: 1.05rem; font-weight: 600; }
.modal-close { color: var(--text-muted); min-height: 0; min-width: 0; padding: 4px; }
.modal-body { overflow-y: auto; padding: 16px; }

/* desktop: centered card */
@media (min-width: 640px) {
  .modal-backdrop { align-items: center; padding: 24px; }
  .modal-card { border-radius: var(--radius); max-height: 84vh; }
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-active .modal-card, .modal-leave-active .modal-card { transition: transform 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-card, .modal-leave-to .modal-card { transform: translateY(24px); }
</style>
