<script setup lang="ts">
import { ref } from 'vue';
import MdiIcon from '../components/MdiIcon.vue';
import { mdiViewDashboard, mdiEmail, mdiEmailMultiple, mdiShieldAlert, mdiCog, mdiMenu, mdiRefresh } from '@mdi/js';
import OverviewView from './views/OverviewView.vue';
import MailboxView from './views/MailboxView.vue';
import MessagesView from './views/MessagesView.vue';
import AbuseView from './views/AbuseView.vue';
import ConfigView from './views/ConfigView.vue';
import '../styles/admin.css';

type ViewKey = 'overview' | 'mailboxes' | 'messages' | 'abuse' | 'config';

const active = ref<ViewKey>('overview');
const sidebarOpen = ref(false);
const refreshTick = ref(0);

const nav: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Tổng quan', icon: mdiViewDashboard },
  { key: 'mailboxes', label: 'Mailbox', icon: mdiEmail },
  { key: 'messages', label: 'Messages', icon: mdiEmailMultiple },
  { key: 'abuse', label: 'Lạm dụng', icon: mdiShieldAlert },
  { key: 'config', label: 'Cấu hình', icon: mdiCog },
];

function select(key: ViewKey) {
  active.value = key;
  sidebarOpen.value = false;
}
</script>

<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <button class="admin-topbar__menu" aria-label="Mở menu" @click="sidebarOpen = !sidebarOpen">
        <MdiIcon :path="mdiMenu" :size="22" />
      </button>
      <h1 class="admin-topbar__title">Quản trị Temp Mail</h1>
      <span class="admin-topbar__spacer"></span>
      <button class="btn-icon" aria-label="Làm mới dữ liệu" title="Làm mới" @click="refreshTick++">
        <MdiIcon :path="mdiRefresh" :size="20" />
      </button>
    </header>

    <div class="admin-body">
      <aside class="admin-sidebar" :class="{ 'admin-sidebar--open': sidebarOpen }">
        <nav class="admin-nav" aria-label="Điều hướng">
          <button
            v-for="item in nav"
            :key="item.key"
            class="admin-nav__item"
            :class="{ 'admin-nav__item--active': active === item.key }"
            :aria-current="active === item.key ? 'page' : undefined"
            @click="select(item.key)"
          >
            <MdiIcon :path="item.icon" :size="20" />
            {{ item.label }}
          </button>
        </nav>
      </aside>

      <main class="admin-main">
        <OverviewView v-if="active === 'overview'" :refresh-tick="refreshTick" />
        <MailboxView v-else-if="active === 'mailboxes'" :refresh-tick="refreshTick" />
        <MessagesView v-else-if="active === 'messages'" :refresh-tick="refreshTick" />
        <AbuseView v-else-if="active === 'abuse'" :refresh-tick="refreshTick" />
        <ConfigView v-else :refresh-tick="refreshTick" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-topbar__spacer { flex: 1; }
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  color: var(--text-muted);
}
.btn-icon:hover { background: var(--bg); color: var(--text); }
@media (min-width: 821px) {
  .admin-topbar__menu { display: none; }
}
</style>
