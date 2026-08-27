<script setup lang="ts">
import { computed } from 'vue';

export interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => string;
  /** Có sortKey thì header trở thành nút sắp xếp và phát sự kiện update:sort. */
  sortKey?: string;
}

export interface SortState {
  key: string;
  order: 'asc' | 'desc';
}

const props = defineProps<{
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  sort?: SortState | null;
  rowClickable?: boolean;
}>();

const emit = defineEmits<{
  'update:offset': [value: number];
  'update:sort': [value: SortState];
  'row-click': [row: Record<string, unknown>];
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
const currentPage = computed(() => Math.floor(props.offset / props.limit) + 1);

function go(page: number): void {
  emit('update:offset', (page - 1) * props.limit);
}

function toggleSort(col: Column): void {
  if (!col.sortKey) return;
  const isActive = props.sort?.key === col.sortKey;
  const order = isActive && props.sort?.order === 'asc' ? 'desc' : 'asc';
  emit('update:sort', { key: col.sortKey, order });
}
</script>

<template>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key">
            <button
              v-if="col.sortKey"
              type="button"
              class="th-sort"
              :class="{ 'th-sort--active': sort?.key === col.sortKey }"
              :aria-sort="sort?.key === col.sortKey ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined"
              @click="toggleSort(col)"
            >
              {{ col.label }}
              <span v-if="sort?.key === col.sortKey" class="th-sort__arrow" aria-hidden="true">
                {{ sort.order === 'asc' ? '▲' : '▼' }}
              </span>
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in rows"
          :key="i"
          :class="{ 'data-table__row--clickable': rowClickable }"
          @click="rowClickable && emit('row-click', row)"
        >
          <td v-for="col in columns" :key="col.key">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ col.render ? col.render(row) : String(row[col.key] ?? '') }}
            </slot>
          </td>
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
.th-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: inherit;
  color: inherit;
  cursor: pointer;
}
.th-sort:hover { color: var(--text); }
.th-sort--active { color: var(--text); }
.th-sort__arrow { font-size: 0.7rem; }
.data-table__row--clickable { cursor: pointer; }
.data-table__row--clickable:hover td { background: color-mix(in srgb, var(--surface) 70%, var(--bg)); }
.table-pager { display: flex; align-items: center; gap: 12px; padding-top: 12px; justify-content: flex-end; font-size: 0.85rem; }
.table-pager button {
  min-height: 44px; min-width: 44px; padding: 0 10px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);
}
.table-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
