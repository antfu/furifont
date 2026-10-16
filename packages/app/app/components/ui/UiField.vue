<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span class="label">{{ label }}</span>
    <slot />
    <span v-if="hint" class="text-xs color-muted lh-1.625">{{ hint }}</span>
  </label>
</template>
