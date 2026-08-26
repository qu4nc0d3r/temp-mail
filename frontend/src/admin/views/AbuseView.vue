<script setup lang="ts">
import { ref, watch } from 'vue';
import { mdiShieldOff, mdiShieldAlert } from '@mdi/js';
import StatCard from '../StatCard.vue';
import TopBarChart from '../TopBarChart.vue';
import TimeSeriesChart from '../TimeSeriesChart.vue';
import DataTable, { type Column } from '../DataTable.vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';

const props = defineProps<{ refreshTick: number }>();

const offset = ref(0);
const eventType = ref<string | null>(null);

const senders = useAdminPolling(() => adminApi.top('senders', 10));
const ips = useAdminPolling(() => adminApi.top('ips', 10));
const overview = useAdminPolling(() => adminApi.overview());
const series = useAdminPolling(() => adminApi.stats('24h'));
const events = useAdminPolling(() => adminApi.events(eventType.value, 20, offset.value));

watch(() => props.refreshTick, () => {
  void senders.refresh();
  void ips.refresh();
  void overview.refresh();
  void series.refresh();
  void events.refresh();
});

function onEventTypeChange(): void {
  offset.value = 0;
  void events.refresh();
}

const columns: Column[] = [
  { key: 'type', label: 'Loại' },
  { key: 'ip_hash', label: 'IP (hash)', render: (r) => (r.ip_hash as string | null)?.slice(0, 12) ?? '—' },
  { key: 'address', label: 'Mailbox', render: (r) => (r.address as string | null) ?? '—' },
  { key: 'created_at', label: 'Thời điểm', render: (r) => formatDateTimeVN(r.created_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Lạm dụng</h2>

    <div class="admin-grid admin-grid--stats">
      <StatCard label="Bị chặn rate-limit (24h)" :value="overview.data.value?.rateLimited24h ?? '…'" :icon="mdiShieldOff" />
      <StatCard label="reCAPTCHA fail (24h)" :value="overview.data.value?.recaptchaFailed24h ?? '…'" :icon="mdiShieldAlert" />
    </div>

    <div class="admin-grid admin-grid--charts">
      <TopBarChart title="Top người gửi (24h)" :items="senders.data.value?.items ?? []" />
      <TopBarChart title="Top IP tạo mailbox (24h)" :items="ips.data.value?.items ?? []" />
    </div>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Rate-limit & reCAPTCHA fail theo thời gian (24h)</h3>
      <TimeSeriesChart :points="series.data.value?.points ?? []" range="24h" />
    </article>

    <article class="card admin-panel">
      <div class="admin-panel__head">
        <h3 class="admin-panel__title">Sự kiện gần đây</h3>
        <select v-model="eventType" class="events-filter" aria-label="Lọc theo loại sự kiện" @change="onEventTypeChange">
          <option :value="null">Tất cả</option>
          <option value="rate_limited">rate_limited</option>
          <option value="recaptcha_failed">recaptcha_failed</option>
        </select>
      </div>
      <DataTable
        :columns="columns"
        :rows="(events.data.value?.events ?? []) as Record<string, unknown>[]"
        :total="events.data.value?.total ?? 0"
        :limit="20"
        :offset="offset"
        @update:offset="(v) => { offset = v; void events.refresh() }"
        @update:limit="() => void events.refresh()"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-grid--charts { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1200px) { .admin-grid--charts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.admin-panel__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.admin-panel__head .admin-panel__title { margin: 0; }
.events-filter {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.85rem;
}
.admin-grid { margin-bottom: 16px; }
</style>
