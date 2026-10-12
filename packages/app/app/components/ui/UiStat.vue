<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
}>()
</script>

<template>
  <div class="flex flex-col gap-1 px-4 py-3">
    <span class="font-mono text-xl tabular-nums">{{ typeof value === 'number' ? value.toLocaleString('en') : value }}</span>
    <span class="label">{{ label }}</span>
  </div>
</template>
