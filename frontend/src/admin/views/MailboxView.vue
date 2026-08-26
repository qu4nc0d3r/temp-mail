<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDateTimeVN } from '../../lib/format';
import { useAdminPolling } from '../useAdminPolling';
import DataTable, { type Column } from '../DataTable.vue';
import { adminApi } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const limit = ref(20);
const offset = ref(0);
const page = useAdminPolling(() => adminApi.mailboxes(limit.value, offset.value));

watch(() => props.refreshTick, () => void page.refresh());
watch([limit, offset], () => void page.refresh());

const columns: Column[] = [
  { key: 'address', label: 'Địa chỉ' },
  { key: 'created_at', label: 'Tạo lúc', render: (r) => formatDateTimeVN(r.created_at as number) },
  { key: 'expires_at', label: 'Hết hạn', render: (r) => formatDateTimeVN(r.expires_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Mailbox</h2>
    <article class="card admin-panel">
      <DataTable
        :columns="columns"
        :rows="(page.data.value?.mailboxes ?? []) as Record<string, unknown>[]"
        :total="page.data.value?.total ?? 0"
        :limit="limit"
        :offset="offset"
        @update:offset="(v) => (offset = v)"
        @update:limit="(v) => (limit = v)"
      />
    </article>
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
</style>
