<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ path: string; size?: number }>(), { size: 24 });
const viewBox = computed(() => `0 0 24 24`);
</script>

<template>
  <svg
    class="mdi-icon"
    :width="props.size"
    :height="props.size"
    :viewBox="viewBox"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="props.path" />
  </svg>
</template>

<style scoped>
.mdi-icon { flex-shrink: 0; vertical-align: middle; }
</style>
