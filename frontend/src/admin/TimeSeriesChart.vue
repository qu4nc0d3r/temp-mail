<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import { chartTheme } from './charts';
import type { StatsPoint } from '../api/admin';

const props = defineProps<{ points: StatsPoint[]; range: '24h' | '7d' }>();

const labels = computed(() =>
  props.points.map((p) => new Date(p.t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
);

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Messages', data: props.points.map((p) => p.messages), borderColor: '#2f6bff', backgroundColor: 'rgba(47,107,255,0.15)', fill: true, tension: 0.35, pointRadius: 0 },
    { label: 'Mailbox tạo mới', data: props.points.map((p) => p.mailboxes), borderColor: '#30a46c', backgroundColor: 'rgba(48,164,108,0.15)', fill: true, tension: 0.35, pointRadius: 0 },
  ],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { labels: { color: chartTheme().text, boxWidth: 14, boxHeight: 14 } },
    tooltip: { backgroundColor: chartTheme().text, titleColor: chartTheme().border, bodyColor: chartTheme().border },
  },
  scales: {
    x: { ticks: { color: chartTheme().muted, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: chartTheme().border } },
    y: { beginAtZero: true, ticks: { color: chartTheme().muted }, grid: { color: chartTheme().border } },
  },
}));
</script>

<template>
  <div class="chart-box">
    <Line :data="chartData" :options="options" />
  </div>
</template>

<style scoped>
.chart-box { position: relative; height: 280px; }
</style>
