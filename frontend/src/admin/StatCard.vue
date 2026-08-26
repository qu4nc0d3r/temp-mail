<script setup lang="ts">
import MdiIcon from '../components/MdiIcon.vue';

defineProps<{ label: string; value: string | number; hint?: string; icon: string }>();
</script>

<template>
  <article class="stat card">
    <div class="stat__icon"><MdiIcon :path="icon" :size="22" /></div>
    <div class="stat__body">
      <p class="stat__label">{{ label }}</p>
      <p class="stat__value">{{ value }}</p>
      <p v-if="hint" class="stat__hint">{{ hint }}</p>
    </div>
  </article>
</template>

<style scoped>
.stat { display: flex; gap: 14px; padding: 18px; }
.stat__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 10px; flex: none;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
.stat__body { min-width: 0; }
.stat__label { margin: 0; font-size: 0.85rem; color: var(--text-muted); }
.stat__value { margin: 2px 0 0; font-size: 1.6rem; font-weight: 700; line-height: 1.2; }
.stat__hint { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-muted); }
</style>
