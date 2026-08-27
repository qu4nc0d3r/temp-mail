<script setup lang="ts">
import { ref, watch } from 'vue';
import MdiIcon from '../../components/MdiIcon.vue';
import { useAdminPolling } from '../useAdminPolling';
import { adminApi, type AdminFeature, type FeatureKey } from '../../api/admin';
import { formatDateTimeVN } from '../../lib/format';
import { useToast } from '../../composables/useToast';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import {
  mdiShieldCheck, mdiEmailOpenOutline, mdiSpeedometer, mdiPencilOutline, mdiRefresh,
} from '@mdi/js';

const props = defineProps<{ refreshTick: number }>();
const config = useAdminPolling(() => adminApi.config());
const overview = useAdminPolling(() => adminApi.overview());
const { success: toastSuccess, error: toastError } = useToast();

const FEATURE_META: Record<FeatureKey, { name: string; desc: string; icon: string; protective: boolean; confirmOff: string }> = {
  recaptcha: {
    name: 'reCAPTCHA bảo vệ',
    desc: 'Yêu cầu xác minh con người khi tạo mailbox (chống spam).',
    icon: mdiShieldCheck,
    protective: true,
    confirmOff: 'Tắt reCAPTCHA sẽ bỏ lớp bảo vệ chống spam khi tạo mailbox. Bạn có chắc muốn tắt?',
  },
  mailbox_create: {
    name: 'Tạo mailbox mới',
    desc: 'Tắt = chế độ bảo trì: người dùng không tạo được mailbox mới (mailbox cũ vẫn hoạt động).',
    icon: mdiEmailOpenOutline,
    protective: true,
    confirmOff: 'Tắt sẽ chuyển trang sang chế độ bảo trì — người dùng không tạo được mailbox mới. Bạn có chắc?',
  },
  rate_limit: {
    name: 'Giới hạn tốc độ',
    desc: 'Giới hạn 20 mailbox/giờ/IP. Tắt = không giới hạn, dễ bị lạm dụng.',
    icon: mdiSpeedometer,
    protective: true,
    confirmOff: 'Tắt giới hạn tốc độ khiến dịch vụ dễ bị lạm dụng (spam/đăng ký hàng loạt). Bạn có chắc?',
  },
  custom_name: {
    name: 'Tên tùy chỉnh',
    desc: 'Cho phép người dùng đặt tên mailbox tùy chỉnh thay vì tên ngẫu nhiên.',
    icon: mdiPencilOutline,
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

    <div class="config-grid">
      <article class="card admin-panel">
        <header class="admin-panel__head">
          <h3 class="admin-panel__title">Tính năng</h3>
          <p class="admin-panel__sub">Bật/tắt tính năng — áp dụng ngay, không cần deploy.</p>
        </header>
        <div v-if="config.error.value" class="admin-error">Không tải được cấu hình: {{ config.error.value }}</div>
        <ul class="feature-list">
          <li v-for="f in config.data.value?.features ?? []" :key="f.key" class="feature-row">
            <span class="feature-icon" :class="{ 'feature-icon--muted': !f.enabled }" aria-hidden="true">
              <MdiIcon :path="FEATURE_META[f.key].icon" :size="20" />
            </span>
            <div class="feature-row__text">
              <span class="feature-row__name">{{ FEATURE_META[f.key].name }}</span>
              <span class="feature-row__desc">{{ FEATURE_META[f.key].desc }}</span>
            </div>
            <div class="feature-row__control">
              <span v-if="f.isDefault" class="badge badge--default" title="Đang dùng giá trị mặc định">theo mặc định</span>
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
                <MdiIcon :path="mdiRefresh" :size="15" /> Về mặc định
              </button>
            </div>
          </li>
        </ul>
      </article>

      <article class="card admin-panel">
        <header class="admin-panel__head">
          <h3 class="admin-panel__title">Hệ thống</h3>
          <p class="admin-panel__sub">Thông tin chỉ đọc.</p>
        </header>
        <dl class="config-list">
          <div class="config-item">
            <dt>Domain</dt>
            <dd>{{ config.data.value?.domain ?? '…' }}</dd>
          </div>
          <div class="config-item" :class="{ 'config-item--warn': config.data.value?.devBypassEnabled }">
            <dt>Bypass xác thực (dev)</dt>
            <dd class="config-item__value" :class="{ 'config-item__value--danger': config.data.value?.devBypassEnabled }">
              {{ config.data.value?.devBypassEnabled ? 'ĐANG BẬT' : 'Tắt' }}
            </dd>
          </div>
          <div class="config-item">
            <dt>Lần chạy cron cuối</dt>
            <dd class="config-item__value">{{ overview.data.value?.lastCronRunAt ? formatDateTimeVN(overview.data.value.lastCronRunAt) : '—' }}</dd>
          </div>
          <div v-if="overview.data.value?.lastCronCleanup" class="config-item">
            <dt>Dọn dẹp cron cuối</dt>
            <dd class="config-item__value">{{ overview.data.value?.lastCronCleanup?.deletedMailboxes }} mailbox / {{ overview.data.value?.lastCronCleanup?.deletedMessages }} messages</dd>
          </div>
        </dl>
      </article>
    </div>

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

.config-grid { display: grid; gap: 20px; grid-template-columns: 1fr; min-width: 0; }
.config-grid > .admin-panel { min-width: 0; }
@media (min-width: 1100px) {
  .config-grid { grid-template-columns: 2fr 1fr; align-items: start; }
}

.admin-panel { padding: 18px; }
.admin-panel__head { margin-bottom: 12px; }
.admin-panel__title { margin: 0; font-size: 1rem; }
.admin-panel__sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-muted); }
.admin-error { color: var(--danger); margin-bottom: 12px; }

.feature-list { list-style: none; margin: 0; padding: 0; }
.feature-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 0; border-bottom: 1px solid var(--border);
}
.feature-row:last-child { border-bottom: none; }

.feature-icon {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.feature-icon--muted { background: var(--bg); color: var(--text-muted); }

.feature-row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.feature-row__name { font-weight: 600; }
.feature-row__desc { color: var(--text-muted); font-size: 0.82rem; }

.feature-row__control { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.badge--default {
  font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 999px; padding: 3px 10px;
}

.switch {
  position: relative; width: 48px; height: 26px; min-width: 48px; min-height: 26px;
  border-radius: 999px; padding: 0;
  background: var(--border); border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
  cursor: pointer; transition: background 0.15s ease;
}
.switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.switch:disabled { opacity: 0.6; cursor: not-allowed; }
.switch--on { background: var(--success); border-color: var(--success); }
.switch__knob {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}
.switch--on .switch__knob { transform: translateX(22px); }

.reset-btn {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--border); color: var(--text-muted); background: transparent;
  border-radius: 8px; padding: 0 10px; font-size: 0.78rem; white-space: nowrap;
}
.reset-btn:hover { color: var(--text); background: var(--bg); }
.reset-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.reset-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.config-list { display: grid; gap: 4px; margin: 0; min-width: 0; }
.config-item {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  padding: 9px 0; border-bottom: 1px solid var(--border); min-width: 0;
}
.config-item:last-child { border-bottom: none; }
.config-item dt { font-size: 0.85rem; color: var(--text-muted); flex-shrink: 0; }
.config-item dd { margin: 0; font-weight: 600; text-align: right; min-width: 0; overflow-wrap: anywhere; }
.config-item--warn {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  border-radius: 8px; padding: 9px 12px; border-bottom: 1px solid var(--border);
}
.config-item--warn dt, .config-item--warn dd { text-wrap: balance; }
.config-item__value--danger { color: var(--danger); }
</style>
