<script setup lang="ts">
import { computed } from 'vue';

export interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => string;
}

const props = defineProps<{
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}>();

const emit = defineEmits<{ 'update:offset': [value: number]; 'update:limit': [value: number] }>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
const currentPage = computed(() => Math.floor(props.offset / props.limit) + 1);

function go(page: number): void {
  emit('update:offset', (page - 1) * props.limit);
}
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="col in columns" :key="col.key">{{ col.render ? col.render(row) : String(row[col.key] ?? '') }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length" class="data-table__empty">Không có dữ liệu</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="table-pager">
    <span>Tổng: {{ total }}</span>
    <button :disabled="currentPage <= 1" @click="go(currentPage - 1)">Trước</button>
    <span>Trang {{ currentPage }} / {{ totalPages }}</span>
    <button :disabled="currentPage >= totalPages" @click="go(currentPage + 1)">Sau</button>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.data-table th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.data-table td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.data-table__empty { text-align: center; color: var(--text-muted); padding: 24px; }
.table-pager { display: flex; align-items: center; gap: 12px; padding-top: 12px; justify-content: flex-end; font-size: 0.85rem; }
.table-pager button {
  min-height: 32px; min-width: 32px; padding: 0 10px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);
}
.table-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
