<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import MdiIcon from './MdiIcon.vue';
import { mdiClose } from '@mdi/js';

const props = withDefaults(defineProps<{ open: boolean; title?: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});
const emit = defineEmits<{ close: [] }>();

const cardRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusFirstInModal() {
  const card = cardRef.value;
  if (!card) return;
  const first = card.querySelector<HTMLElement>(FOCUSABLE);
  (first ?? card).focus();
}

// mở → lưu phần tử đang focus và chuyển focus vào modal; đóng → restore
watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      void nextTick(focusFirstInModal);
    } else if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  },
  { immediate: true },
);

// giữ Tab trong modal (vòng lại từ đầu/cuối), Escape → đóng
function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const card = cardRef.value;
  if (!card) return;
  const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  // focus rơi ra ngoài card (vd: click vùng trống trong modal) → kéo ngược vào modal,
  // tránh Tab đi tiếp ra ngoài
  if (!active || !card.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="props.open" class="modal-backdrop" @click.self="emit('close')">
        <div ref="cardRef" class="modal-card" :class="`modal-card--${props.size}`" role="dialog" aria-modal="true" :aria-label="title || undefined">
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
