<script setup lang="ts">
import { ref } from 'vue';
import MdiIcon from '../components/MdiIcon.vue';
import { mdiLock, mdiLogin } from '@mdi/js';
import { adminApi } from '../api/admin';
import { ApiClientError } from '../api/client';

const apiKey = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function onSubmit() {
  error.value = null;
  if (!apiKey.value) { error.value = 'Nhập khóa quản trị'; return; }
  loading.value = true;
  try {
    await adminApi.login(apiKey.value);
    // Thành công: adminApi.login set adminSession → AdminApp tự chuyển sang dashboard.
  } catch (e) {
    error.value = e instanceof ApiClientError && e.status === 401
      ? 'Sai khóa quản trị'
      : 'Không kết nối được máy chủ';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-wrap">
    <form class="card login" @submit.prevent="onSubmit">
      <h1 class="login__title"><MdiIcon :path="mdiLock" :size="24" /> Quản trị Temp Mail</h1>
      <p class="login__hint">Nhập khóa quản trị để vào bảng điều khiển.</p>
      <label class="login__label" for="apikey">Khóa quản trị</label>
      <input
        id="apikey"
        v-model="apiKey"
        class="login__input"
        type="password"
        autocomplete="current-password"
        :disabled="loading"
        placeholder="••••••••"
      />
      <p v-if="error" class="login__error" role="alert">{{ error }}</p>
      <button class="login__submit" type="submit" :disabled="loading">
        <MdiIcon :path="mdiLogin" :size="18" /> {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.login { width: 100%; max-width: 380px; padding: 28px; }
.login__title { margin: 0 0 8px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px; }
.login__hint { margin: 0 0 20px; color: var(--text-muted); font-size: 0.9rem; }
.login__label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; }
.login__input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border, #d0d5dd); background: var(--bg-card, #fff); color: var(--text, #111); }
.login__error { color: var(--danger); font-size: 0.9rem; margin: 12px 0 0; }
.login__submit { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-top: 16px; width: 100%; background: var(--accent); color: #fff; padding: 10px 16px; border-radius: 8px; font-weight: 600; }
.login__submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
