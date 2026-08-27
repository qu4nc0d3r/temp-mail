<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi, type AdminFeature, type FeatureKey } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';
import { useToast } from '../../composables/useToast';
import ConfirmDialog from '../../components/ConfirmDialog.vue';

const props = defineProps<{ refreshTick: number }>();
const config = useAdminPolling(() => adminApi.config());
const overview = useAdminPolling(() => adminApi.overview());
const { success: toastSuccess, error: toastError } = useToast();

const FEATURE_META: Record<FeatureKey, { name: string; desc: string; protective: boolean; confirmOff: string }> = {
  recaptcha: {
    name: 'reCAPTCHA bảo vệ',
    desc: 'Yêu cầu xác minh con người khi tạo mailbox (chống spam).',
    protective: true,
    confirmOff: 'Tắt reCAPTCHA sẽ bỏ lớp bảo vệ chống spam khi tạo mailbox. Bạn có chắc muốn tắt?',
  },
  mailbox_create: {
    name: 'Tạo mailbox mới',
    desc: 'Tắt = chế độ bảo trì: người dùng không tạo được mailbox mới (mailbox cũ vẫn hoạt động).',
    protective: true,
    confirmOff: 'Tắt sẽ chuyển trang sang chế độ bảo trì — người dùng không tạo được mailbox mới. Bạn có chắc?',
  },
  rate_limit: {
    name: 'Giới hạn tốc độ',
    desc: 'Giới hạn 20 mailbox/giờ/IP. Tắt = không giới hạn, dễ bị lạm dụng.',
    protective: true,
    confirmOff: 'Tắt giới hạn tốc độ khiến dịch vụ dễ bị lạm dụng (spam/đăng ký hàng loạt). Bạn có chắc?',
  },
  custom_name: {
    name: 'Tên tùy chỉnh',
    desc: 'Cho phép người dùng đặt tên mailbox tùy chỉnh thay vì tên ngẫu nhiên.',
    protective: false,
    confirmOff: 'Tắt tên tùy chỉnh — người dùng chỉ nhận tên mailbox ngẫu nhiên. Bạn có chắc?',
  },
};

const pending = ref<AdminFeature | null>(null);
const busy = ref(false);

function onToggle(f: AdminFeature) {
  if (f.enabled) {
    if (FEATURE_META[f.key].protective) pending.value = f;
    else void apply(f.key, false);
  } else {
    void apply(f.key, true);
  }
}

async function apply(key: FeatureKey, enabled: boolean) {
  busy.value = true;
  try {
    await adminApi.updateFeature(key, enabled);
    await config.refresh();
    toastSuccess(enabled ? 'Đã bật' : 'Đã tắt');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Không cập nhật được');
  } finally {
    busy.value = false;
  }
}

async function onConfirmPending() {
  const f = pending.value;
  pending.value = null;
  if (f) await apply(f.key, false);
}

async function onReset(key: FeatureKey) {
  busy.value = true;
  try {
    await adminApi.resetFeature(key);
    await config.refresh();
    toastSuccess('Đã đặt lại về mặc định');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Không đặt lại được');
  } finally {
    busy.value = false;
  }
}

watch(() => props.refreshTick, () => {
  void config.refresh();
  void overview.refresh();
});
</script>

<template>
  <section class="admin-view">
    <h2 class="admin-view__title">Cấu hình</h2>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Tính năng</h3>
      <div v-if="config.error.value" class="admin-error">Không tải được cấu hình: {{ config.error.value }}</div>
      <ul class="feature-list">
        <li v-for="f in config.data.value?.features ?? []" :key="f.key" class="feature-row">
          <div class="feature-row__text">
            <span class="feature-row__name">{{ FEATURE_META[f.key].name }}</span>
            <span class="feature-row__desc">{{ FEATURE_META[f.key].desc }}</span>
          </div>
          <div class="feature-row__control">
            <span v-if="f.isDefault" class="badge badge--default" title="Đang dùng giá trị mặc định">mặc định</span>
            <button
              type="button"
              class="switch"
              role="switch"
              :aria-checked="f.enabled"
              :disabled="busy"
              :class="{ 'switch--on': f.enabled }"
              @click="onToggle(f)"
            >
              <span class="switch__knob"></span>
            </button>
            <button v-if="!f.isDefault" type="button" class="reset-btn" :disabled="busy" @click="onReset(f.key)">
              Reset
            </button>
          </div>
        </li>
      </ul>
    </article>

    <article class="card admin-panel">
      <h3 class="admin-panel__title">Hệ thống (chỉ đọc)</h3>
      <dl class="config-list">
        <div><dt>Domain</dt><dd>{{ config.data.value?.domain ?? '…' }}</dd></div>
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

    <ConfirmDialog
      :open="!!pending"
      :title="pending ? `Tắt ${FEATURE_META[pending.key].name}` : ''"
      :message="pending ? FEATURE_META[pending.key].confirmOff : ''"
      confirm-text="Tắt tính năng"
      cancel-text="Hủy"
      @confirm="onConfirmPending"
      @cancel="pending = null"
    />
  </section>
</template>

<style scoped>
.admin-view__title { margin: 0 0 16px; font-size: 1.2rem; }
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.admin-error { color: var(--danger); margin-bottom: 12px; }
.feature-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.feature-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 0; border-bottom: 1px solid var(--border);
}
.feature-row:last-child { border-bottom: none; }
.feature-row__text { display: flex; flex-direction: column; gap: 2px; }
.feature-row__name { font-weight: 600; }
.feature-row__desc { color: var(--text-muted); font-size: 0.82rem; }
.feature-row__control { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.badge--default {
  font-size: 0.72rem; color: var(--text-muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; white-space: nowrap;
}
.switch {
  position: relative; width: 44px; height: 24px; border-radius: 999px;
  background: var(--border); border: none; cursor: pointer; transition: background 0.15s ease; padding: 0;
}
.switch:disabled { opacity: 0.6; cursor: not-allowed; }
.switch--on { background: var(--success); }
.switch__knob {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: transform 0.15s ease;
}
.switch--on .switch__knob { transform: translateX(20px); }
.reset-btn {
  border: 1px solid var(--border); color: var(--text-muted); background: transparent;
  border-radius: 6px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer;
}
.reset-btn:hover { color: var(--text); background: var(--bg); }
.reset-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.config-list { display: grid; gap: 10px; margin: 0; }
.config-list > div { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); padding: 8px 0; }
.config-list dt { color: var(--text-muted); }
.config-list dd { margin: 0; font-weight: 600; }
.config-list__on { color: var(--danger); }
</style>
