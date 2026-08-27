<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import MdiIcon from '../../components/MdiIcon.vue';
import { mdiMagnify } from '@mdi/js';
import { formatDateTimeVN } from '../../lib/format';
import { useAdminPolling } from '../useAdminPolling';
import DataTable, { type Column, type SortState } from '../DataTable.vue';
import AdminMessageModal from '../../components/AdminMessageModal.vue';
import { adminApi, type AdminMessagesQuery, type MessageSortKey } from '../../api/admin';

const props = defineProps<{ refreshTick: number }>();

const limit = ref(20);
const offset = ref(0);
const qInput = ref('');
const q = ref('');
const mailboxInput = ref('');
const mailboxFilter = ref('');
const sort = ref<SortState | null>({ key: 'received_at', order: 'desc' });
const selectedId = ref<string | null>(null);
const modalOpen = ref(false);

// Gõ liên tục → chỉ commit query + refetch sau 300ms nghỉ.
let debounceTimer: number | undefined;
function debounceCommit(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    q.value = qInput.value.trim();
    mailboxFilter.value = mailboxInput.value.trim();
  }, 300);
}
onUnmounted(() => window.clearTimeout(debounceTimer));

const page = useAdminPolling(() => {
  const query: AdminMessagesQuery = {
    q: q.value || undefined,
    mailbox: mailboxFilter.value || undefined,
    sortBy: sort.value?.key as MessageSortKey | undefined,
    order: sort.value?.order,
    limit: limit.value,
    offset: offset.value,
  };
  return adminApi.messages(query);
});

watch(() => props.refreshTick, () => void page.refresh());
watch([limit, offset], () => void page.refresh());
// Bất kỳ thay đổi bộ lọc/sort nào → về trang đầu rồi refetch.
watch([q, mailboxFilter, sort], () => {
  offset.value = 0;
  void page.refresh();
});

function setMailboxFilter(value: string): void {
  window.clearTimeout(debounceTimer);
  mailboxInput.value = value;
  mailboxFilter.value = value;
}

function onSort(next: SortState): void {
  sort.value = next;
}

function openDetail(row: Record<string, unknown>): void {
  selectedId.value = String(row.id ?? '');
  modalOpen.value = true;
}

const columns: Column[] = [
  { key: 'from_addr', label: 'Người gửi', sortKey: 'from_addr' },
  { key: 'subject', label: 'Tiêu đề', sortKey: 'subject' },
  { key: 'mailbox', label: 'Mailbox', sortKey: 'mailbox' },
  { key: 'received_at', label: 'Nhận lúc', sortKey: 'received_at', render: (r) => formatDateTimeVN(r.received_at as number) },
];
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Messages</h2>
    <div v-if="page.error.value" class="admin-error">Không tải được dữ liệu: {{ page.error.value }}</div>
    <article class="card admin-panel">
      <div class="messages-toolbar">
        <label class="messages-search">
          <MdiIcon :path="mdiMagnify" :size="18" />
          <input
            v-model="qInput"
            type="search"
            placeholder="Tìm người gửi, tiêu đề, mailbox…"
            aria-label="Tìm kiếm tin nhắn"
            @input="debounceCommit"
          />
        </label>
        <label class="messages-mailbox-filter">
          <span>Mailbox:</span>
          <input
            v-model="mailboxInput"
            type="text"
            placeholder="Địa chỉ đầy đủ"
            aria-label="Lọc theo mailbox chính xác"
            @input="debounceCommit"
          />
        </label>
      </div>
      <DataTable
        :columns="columns"
        :rows="(page.data.value?.messages ?? []) as Record<string, unknown>[]"
        :total="page.data.value?.total ?? 0"
        :limit="limit"
        :offset="offset"
        :sort="sort"
        :row-clickable="true"
        @update:offset="(v) => (offset = v)"
        @update:sort="onSort"
        @row-click="openDetail"
      >
        <template #cell-mailbox="{ row }">
          <button type="button" class="mailbox-link" :title="`Xem tin nhắn của ${row.mailbox}`" @click.stop="setMailboxFilter(String(row.mailbox))">
            {{ row.mailbox }}
          </button>
        </template>
      </DataTable>
    </article>
    <AdminMessageModal :open="modalOpen" :message-id="selectedId" @close="modalOpen = false" />
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
.messages-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}
.messages-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  min-width: 220px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
}
.messages-search:focus-within { border-color: var(--accent); color: var(--text); }
.messages-search input { background: none; border: none; outline: none; color: var(--text); font-size: 0.9rem; width: 100%; }
.messages-mailbox-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.messages-mailbox-filter input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 8px 12px;
  font-size: 0.9rem;
  width: 220px;
}
.messages-mailbox-filter input:focus { outline: none; border-color: var(--accent); }
.mailbox-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.mailbox-link:hover { filter: brightness(1.15); }
</style>
