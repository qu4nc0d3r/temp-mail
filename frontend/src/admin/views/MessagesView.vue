<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDateTimeVN } from '../../lib/format';
import { useAdminPolling } from '../useAdminPolling';
import DataTable, { type Column } from '../DataTable.vue';
import { adminApi } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const limit = ref(20);
const offset = ref(0);
const page = useAdminPolling(() => adminApi.messages(limit.value, offset.value));

watch(() => props.refreshTick, () => void page.refresh());
watch([limit, offset], () => void page.refresh());

const columns: Column[] = [
  { key: 'from_addr', label: 'Người gửi' },
  { key: 'subject', label: 'Tiêu đề' },
  { key: 'mailbox', label: 'Mailbox' },
  { key: 'received_at', label: 'Nhận lúc', render: (r) => formatDateTimeVN(r.received_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Messages</h2>
    <div v-if="page.error.value" class="admin-error">Không tải được dữ liệu: {{ page.error.value }}</div>
    <article class="card admin-panel">
      <DataTable
        :columns="columns"
        :rows="(page.data.value?.messages ?? []) as Record<string, unknown>[]"
        :total="page.data.value?.total ?? 0"
        :limit="limit"
        :offset="offset"
        @update:offset="(v) => (offset = v)"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
.admin-error {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid var(--danger);
  color: var(--danger);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}
</style>
