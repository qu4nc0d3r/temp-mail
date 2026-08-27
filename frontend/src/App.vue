<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import MdiIcon from './components/MdiIcon.vue';
import ToastContainer from './components/ToastContainer.vue';
import AddressCard from './components/AddressCard.vue';
import InboxList from './components/InboxList.vue';
import MessageModal from './components/MessageModal.vue';
import NewAddressModal from './components/NewAddressModal.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import FooterNotice from './components/FooterNotice.vue';
import { useMailbox } from './composables/useMailbox';
import { useInbox } from './composables/useInbox';
import { useToast } from './composables/useToast';
import { getPublicConfig, ApiClientError, type PublicConfig } from './api/client';
import { copyText } from './lib/clipboard';
import { notifyNewMail } from './lib/notify';
import { updateFavicon } from './lib/favicon';
import { mdiLightningBolt, mdiCheckBold, mdiAlertCircleOutline } from '@mdi/js';

const { session, remainingMs, expired, create, extend, remove, clear } = useMailbox();
const { success, error: toastError, warning } = useToast();
const creating = ref(false);
const customOpen = ref(false);
const selectedMessageId = ref<string | null>(null);
const confirmDelete = ref(false);
const publicConfig = ref<PublicConfig | null>(null);
const maintenance = computed(() => publicConfig.value?.features.mailboxCreate === false);
const customNameEnabled = computed(() => publicConfig.value?.features.customName !== false);

const inbox = useInbox({
  session,
  onNewMail: (fresh) => {
    const subject = fresh[0]?.subject ?? 'New mail';
    // tab ẩn thì bỏ toast (user không nhìn thấy), notifyNewMail đã tự gate visibility
    if (document.visibilityState !== 'hidden') {
      success(`${subject} — ${fresh.length} new message${fresh.length > 1 ? 's' : ''}`);
    }
    void notifyNewMail(subject, fresh.length);
  },
});

// title + favicon phản ánh số mail chưa đọc; immediate để luôn có favicon nền
// ngay khi mount (kể cả khi inbox trống/đã đọc hết)
watch(
  () => inbox.unreadCount.value,
  (n) => {
    document.title = n > 0 ? `(${n}) Temp Mail` : 'Temp Mail';
    updateFavicon(n);
  },
  { immediate: true },
);

// mailbox hết hạn/bị xoá → reset inbox để unreadCount về 0, title/favicon hết badge
watch(expired, (e) => {
  if (e) inbox.reset();
});

async function ensureSession() {
  if (maintenance.value) return;
  if (expired.value) {
    creating.value = true;
    try {
      await create();
      await inbox.refresh(); // reset theo địa chỉ mailbox mới do chính useInbox xử lý
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not create mailbox');
    } finally {
      creating.value = false;
    }
  } else {
    await inbox.refresh();
  }
}

async function onCopy() {
  if (!session.value) return;
  try {
    await copyText(session.value.address);
    success('Address copied to clipboard');
  } catch {
    toastError('Could not copy address');
  }
}

async function onExtend() {
  try {
    await extend();
    success('Extended by 10 minutes');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Could not extend mailbox');
  }
}

function onRemove() {
  confirmDelete.value = true;
}

async function onConfirmDelete() {
  confirmDelete.value = false;
  try {
    await remove();
    warning('Mailbox deleted');
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Could not delete mailbox');
  }
}

async function onSubmitCustom(name: string) {
  creating.value = true;
  try {
    await create(name || undefined);
    customOpen.value = false;
    const domain = session.value?.address.split('@')[1] ?? '';
    success(name ? `Created ${name}@${domain}` : 'Created a new mailbox');
    await inbox.refresh();
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 409) toastError('That name is already taken');
    else toastError(e instanceof Error ? e.message : 'Could not create mailbox');
  } finally {
    creating.value = false;
  }
}

function onOpenMessage(id: string) {
  inbox.markRead(id);
  selectedMessageId.value = id;
}

onMounted(async () => {
  try {
    publicConfig.value = await getPublicConfig();
  } catch {
    /* lỗi config → mặc định các cờ đều bật */
  }
  // title/favicon do watch immediate ở trên sở hữu — không set lại ở đây
  await ensureSession();
  inbox.start();
});
onUnmounted(() => inbox.stop());
</script>

<template>
  <main>
    <header class="brand">
      <MdiIcon :path="mdiLightningBolt" :size="26" />
      <h1 class="brand__title">Temp Mail</h1>
    </header>

    <div class="layout">
      <div class="layout__side">
        <div v-if="maintenance" class="maintenance card">
          <MdiIcon :path="mdiAlertCircleOutline" :size="20" />
          <p>Trang đang bảo trì — tạm ngưng tạo mailbox mới.</p>
        </div>

        <AddressCard
          v-if="session"
          :session="session"
          :remaining-ms="remainingMs"
          :custom-name-enabled="customNameEnabled"
          @copy="onCopy"
          @extend="onExtend"
          @remove="onRemove"
          @open-custom="customOpen = true"
        />

        <div v-if="expired" class="expired card">
          <p>This mailbox has expired.</p>
          <button class="expired__cta" :disabled="creating || maintenance" @click="ensureSession">
            <MdiIcon :path="mdiCheckBold" :size="18" /> {{ creating ? 'Creating…' : 'Create a new address' }}
          </button>
        </div>
      </div>

      <div class="layout__main">
        <InboxList
          :messages="inbox.messages.value"
          :loading="inbox.loading.value"
          :expired="expired"
          :read-ids="inbox.readIds.value"
          @open-message="onOpenMessage"
          @refresh="ensureSession"
        />
      </div>
    </div>

    <MessageModal :open="!!selectedMessageId" :message-id="selectedMessageId" :session="session" @close="selectedMessageId = null" />
    <NewAddressModal :open="customOpen" :loading="creating" :custom-name-enabled="customNameEnabled" @close="customOpen = false" @submit="onSubmitCustom" />
    <ConfirmDialog
      :open="confirmDelete"
      title="Delete mailbox"
      message="Delete this mailbox permanently? You will lose all received messages."
      @confirm="onConfirmDelete"
      @cancel="confirmDelete = false"
    />
    <ToastContainer />
    <FooterNotice />
  </main>
</template>

<style scoped>
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.brand__title { margin: 0; font-size: 1.3rem; font-weight: 700; }
.brand :deep(svg) { color: var(--accent); }
.expired {
  margin-top: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.expired p { margin: 0; }
.expired__cta {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--accent); color: #fff; padding: 0 16px; border-radius: 8px; font-weight: 600;
}
.expired__cta:disabled { opacity: 0.6; cursor: not-allowed; }
.maintenance {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 16px; padding: 14px 16px;
  color: var(--warning);
}
.maintenance p { margin: 0; }

/* 2-column layout on desktop: address card pinned left, inbox right */
@media (min-width: 960px) {
  .layout {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .layout__side { position: sticky; top: 16px; }
  .layout__main :deep(.inbox) { margin-top: 0; }
}
</style>
