<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import MdiIcon from './components/MdiIcon.vue';
import ToastContainer from './components/ToastContainer.vue';
import AddressCard from './components/AddressCard.vue';
import InboxList from './components/InboxList.vue';
import MessageModal from './components/MessageModal.vue';
import NewAddressModal from './components/NewAddressModal.vue';
import { useMailbox } from './composables/useMailbox';
import { useInbox } from './composables/useInbox';
import { useToast } from './composables/useToast';
import { ApiClientError } from './api/client';
import { mdiLightningBolt, mdiCheckBold } from '@mdi/js';

const { session, remainingMs, expired, create, extend, remove, clear } = useMailbox();
const { success, error: toastError, warning } = useToast();
const creating = ref(false);
const customOpen = ref(false);
const selectedMessageId = ref<string | null>(null);

const inbox = useInbox({
  session,
  onNewMail: (fresh) => {
    const subject = fresh[0]?.subject ?? 'New mail';
    success(`${subject} — ${fresh.length} new message${fresh.length > 1 ? 's' : ''}`);
    document.title = `(${fresh.length}) ${document.title.replace(/^\(\d+\) /, '')}`;
  },
});

async function ensureSession() {
  if (expired.value) {
    creating.value = true;
    try {
      await create();
      await inbox.refresh();
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
    await navigator.clipboard.writeText(session.value.address);
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

async function onRemove() {
  if (!window.confirm('Delete this mailbox permanently?')) return;
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
    await create(name);
    customOpen.value = false;
    success(`Created ${name}@${session.value?.address.split('@')[1]}`);
    await inbox.refresh();
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 409) toastError('That name is already taken');
    else toastError(e instanceof Error ? e.message : 'Could not create mailbox');
  } finally {
    creating.value = false;
  }
}

function onOpenMessage(id: string) {
  selectedMessageId.value = id;
}

onMounted(async () => {
  document.title = 'Temp Mail';
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

    <AddressCard
      v-if="session"
      :session="session"
      :remaining-ms="remainingMs"
      @copy="onCopy"
      @extend="onExtend"
      @remove="onRemove"
      @open-custom="customOpen = true"
      @refresh="ensureSession"
    />

    <div v-if="expired" class="expired card">
      <p>This mailbox has expired.</p>
      <button class="expired__cta" :disabled="creating" @click="ensureSession">
        <MdiIcon :path="mdiCheckBold" :size="18" /> {{ creating ? 'Creating…' : 'Create a new address' }}
      </button>
    </div>

    <InboxList
      :messages="inbox.messages.value"
      :loading="inbox.loading.value"
      :expired="expired"
      @open-message="onOpenMessage"
      @refresh="ensureSession"
    />

    <MessageModal :open="!!selectedMessageId" :message-id="selectedMessageId" :session="session" @close="selectedMessageId = null" />
    <NewAddressModal :open="customOpen" :loading="creating" @close="customOpen = false" @submit="onSubmitCustom" />
    <ToastContainer />
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
</style>
