<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import { chartTheme } from './charts';

const props = defineProps<{ title: string; items: { label: string; count: number }[] }>();

const labels = computed(() => props.items.map((i) => i.label.length > 24 ? `${i.label.slice(0, 24)}…` : i.label));
const chartData = computed(() => ({
  labels: labels.value,
  datasets: [{ label: 'Số lần', data: props.items.map((i) => i.count), backgroundColor: 'rgba(245,165,36,0.75)', borderColor: '#f5a524', borderWidth: 1 }],
}));

const options = computed(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: chartTheme().text, titleColor: chartTheme().border, bodyColor: chartTheme().border } },
  scales: {
    x: { beginAtZero: true, ticks: { color: chartTheme().muted, precision: 0 }, grid: { color: chartTheme().border } },
    y: { ticks: { color: chartTheme().muted }, grid: { display: false } },
  },
}));
</script>

<template>
  <article class="card admin-panel">
    <h3 class="admin-panel__title">{{ title }}</h3>
    <div class="bar-box">
      <Bar :data="chartData" :options="options" />
    </div>
  </article>
</template>

<style scoped>
.admin-panel { padding: 18px; }
.admin-panel__title { margin: 0 0 12px; font-size: 1rem; }
.bar-box { position: relative; height: 260px; }
</style>
