<script setup lang="ts">
import { computed } from 'vue';
import { formatDateTimeVN } from '../lib/format';
import type { AdminOverview, AdminConfig } from '../api/admin';

const props = defineProps<{ overview: AdminOverview | null; config: AdminConfig | null }>();

const lastRun = computed(() => (props.overview?.lastCronRunAt ? formatDateTimeVN(props.overview.lastCronRunAt) : 'Chưa có dữ liệu'));
</script>

<template>
  <section class="card health">
    <div v-if="config?.devBypassEnabled === true" class="health__dev-warning">
      CẢNH BÁO: ADMIN_DEV_BYPASS đang bật — API admin KHÔNG được xác thực
    </div>
    <h2 class="health__title">Sức khỏe hệ thống</h2>
    <dl class="health__grid">
      <div><dt>Lần chạy cron cuối</dt><dd>{{ lastRun }}</dd></div>
      <div><dt>Mailbox đã dọn</dt><dd>{{ overview?.lastCronCleanup?.deletedMailboxes ?? '—' }}</dd></div>
      <div><dt>Messages đã dọn</dt><dd>{{ overview?.lastCronCleanup?.deletedMessages ?? '—' }}</dd></div>
      <div><dt>Domain</dt><dd>{{ config?.domain ?? '—' }}</dd></div>
      <div><dt>reCAPTCHA</dt><dd>{{ config?.recaptchaEnabled ? 'Bật' : 'Tắt' }}</dd></div>
    </dl>
  </section>
</template>

<style scoped>
.health { padding: 20px; }
.health__dev-warning {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  font-weight: 600;
}
.health__title { margin: 0 0 12px; font-size: 1rem; }
.health__grid { display: grid; gap: 8px 24px; margin: 0; }
.health__grid > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 6px 0; }
.health__grid dt { color: var(--text-muted); font-size: 0.9rem; }
.health__grid dd { margin: 0; font-weight: 600; font-size: 0.9rem; }
</style>
