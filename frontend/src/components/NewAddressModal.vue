<script setup lang="ts">
import { ref } from 'vue';
import AppModal from './AppModal.vue';
import MdiIcon from './MdiIcon.vue';
import { mdiKeyVariant } from '@mdi/js';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{ close: []; submit: [name: string] }>();

const name = ref('');
const error = ref<string | null>(null);

function submit() {
  const value = name.value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(value)) {
    error.value = '3-30 chars: lowercase letters, digits, dot, dash, underscore';
    return;
  }
  error.value = null;
  emit('submit', value);
}
</script>

<template>
  <AppModal :open="props.open" title="Custom address" size="sm" @close="emit('close')">
    <form class="form" @submit.prevent="submit">
      <label class="form__label" for="custom-name">Choose a name</label>
      <div class="form__row">
        <input
          id="custom-name"
          v-model="name"
          class="form__input"
          placeholder="john.doe"
          autocomplete="off"
          spellcheck="false"
          maxlength="30"
        />
        <span class="form__suffix">@domain</span>
      </div>
      <p v-if="error" class="form__error">{{ error }}</p>
      <button class="form__submit" type="submit" :disabled="props.loading">
        <MdiIcon :path="mdiKeyVariant" :size="18" /> {{ props.loading ? 'Creating…' : 'Create mailbox' }}
      </button>
    </form>
  </AppModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 10px; }
.form__label { font-size: 0.85rem; color: var(--text-muted); }
.form__row { display: flex; align-items: center; gap: 6px; }
.form__input {
  flex: 1;
  font-family: inherit;
  font-size: 1rem;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  min-width: 0;
}
.form__input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.form__suffix { color: var(--text-muted); white-space: nowrap; }
.form__error { margin: 0; color: var(--danger); font-size: 0.8rem; }
.form__submit {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--accent); color: #fff; padding: 0 16px; border-radius: 8px; font-weight: 600;
}
.form__submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
