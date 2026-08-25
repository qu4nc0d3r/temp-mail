import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 4000;
const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  function dismiss(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.value.splice(idx, 1);
  }

  function show(type: ToastType, message: string) {
    const id = ++nextId;
    toasts.value.push({ id, type, message });
    if (toasts.value.length > MAX_TOASTS) toasts.value.shift();
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }

  return {
    toasts,
    show,
    success: (m: string) => show('success', m),
    error: (m: string) => show('error', m),
    warning: (m: string) => show('warning', m),
    info: (m: string) => show('info', m),
    dismiss,
  };
}
