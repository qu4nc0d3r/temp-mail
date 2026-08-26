<script setup lang="ts">
import { watch, ref } from 'vue';
import { mdiInbox, mdiEmailFast, mdiEmailPlus, mdiShieldOff } from '@mdi/js';
import StatCard from '../StatCard.vue';
import TimeSeriesChart from '../TimeSeriesChart.vue';
import HealthPanel from '../HealthPanel.vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';
import type { AdminConfig } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const overview = useAdminPolling(() => adminApi.overview());
const stats = useAdminPolling(() => adminApi.stats('24h'));
const config = useAdminPolling(() => adminApi.config());

watch(() => props.refreshTick, () => {
  void overview.refresh();
  void stats.refresh();
  void config.refresh();
});
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Tổng quan</h2>

    <div v-if="overview.error.value" class="admin-error">Không tải được dữ liệu: {{ overview.error.value }}</div>

    <div class="admin-grid admin-grid--stats">
      <StatCard label="Mailbox đang hoạt động" :value="overview.data.value?.activeMailboxes ?? '…'" :icon="mdiInbox" />
      <StatCard label="Messages (24h)" :value="overview.data.value?.messages24h ?? '…'" :hint="`${overview.data.value?.mailPerMinute ?? 0} mail/phút`" :icon="mdiEmailFast" />
      <StatCard label="Mailbox tạo mới (24h)" :value="overview.data.value?.mailboxesCreated24h ?? '…'" :icon="mdiEmailPlus" />
      <StatCard label="Bị chặn rate-limit (24h)" :value="overview.data.value?.rateLimited24h ?? '…'" :icon="mdiShieldOff" />
    </div>

    <div class="admin-grid admin-grid--wide">
      <article class="card admin-panel">
        <div class="admin-panel__head">
          <h3 class="admin-panel__title">Messages & Mailbox theo thời gian (24h)</h3>
        </div>
        <TimeSeriesChart :points="stats.data.value?.points ?? []" range="24h" />
      </article>
      <HealthPanel :overview="overview.data.value" :config="config.data.value" />
    </div>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-grid--wide { grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1200px) {
  .admin-grid--wide { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
}
.admin-panel { padding: 18px; }
.admin-panel__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.admin-panel__title { margin: 0; font-size: 1rem; }
.admin-error {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
</style>
