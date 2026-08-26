import { ref, onMounted, onUnmounted } from 'vue';

export function useAdminPolling<T>(fetcher: () => Promise<T>, intervalMs = 30_000) {
  const data = ref<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let timer: number | undefined;
  let stopped = false;

  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      data.value = await fetcher();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Không thể tải dữ liệu';
    } finally {
      loading.value = false;
    }
  }

  function schedule(): void {
    if (stopped) return;
    timer = window.setTimeout(() => {
      if (document.hidden) {
        schedule();
        return;
      }
      void refresh().finally(schedule);
    }, intervalMs);
  }

  onMounted(() => {
    stopped = false;
    void refresh().finally(schedule);
  });

  onUnmounted(() => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  });

  return { data, loading, error, refresh };
}
