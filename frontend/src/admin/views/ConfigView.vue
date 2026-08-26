<script setup lang="ts">
import { watch } from 'vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';

const props = defineProps<{ refreshTick: number }>();
const config = useAdminPolling(() => adminApi.config());
const overview = useAdminPolling(() => adminApi.overview());

watch(() => props.refreshTick, () => {
  void config.refresh();
  void overview.refresh();
});
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Cấu hình</h2>
    <article class="card admin-panel">
      <h3 class="admin-panel__title">Cấu hình hệ thống (chỉ đọc)</h3>
      <dl class="config-list">
        <div><dt>Domain</dt><dd>{{ config.data.value?.domain ?? '…' }}</dd></div>
        <div><dt>reCAPTCHA</dt><dd>{{ config.data.value?.recaptchaEnabled ? 'Bật' : 'Tắt' }}</dd></div>
        <div>
          <dt>Bypass xác thực (dev)</dt>
          <dd class="config-list__warn" :class="{ 'config-list__on': config.data.value?.devBypassEnabled }">
            {{ config.data.value?.devBypassEnabled ? 'ĐANG BẬT — cảnh báo' : 'Tắt' }}
          </dd>
        </div>
        <div>
          <dt>Lần chạy cron cuối</dt>
          <dd>{{ overview.data.value?.lastCronRunAt ? formatDateTimeVN(overview.data.value.lastCronRunAt) : '—' }}</dd>
        </div>
        <div v-if="overview.data.value?.lastCronCleanup">
          <dt>Dọn dẹp cron cuối</dt>
          <dd>{{ overview.data.value?.lastCronCleanup?.deletedMailboxes }} mailbox / {{ overview.data.value?.lastCronCleanup?.deletedMessages }} messages</dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.config-list { display: grid; gap: 10px; margin: 0; }
.config-list > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 8px 0; }
.config-list dt { color: var(--text-muted); }
.config-list dd { margin: 0; font-weight: 600; }
.config-list__on { color: var(--danger); }
</style>
