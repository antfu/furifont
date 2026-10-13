<script setup lang="ts">
defineProps<{
  label: string
  /** The value as read, beside the label. */
  display: string
  hint?: string
  min: number
  max: number
  step?: number
}>()
const model = defineModel<number>({ required: true })
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span class="label flex justify-between gap-3">
      <span>{{ label }}</span>
      <span class="color-base tabular-nums">{{ display }}</span>
    </span>
    <input v-model.number="model" type="range" :min :max :step class="w-full accent-[var(--ff-fg)]">
    <span v-if="hint" class="text-xs color-muted">{{ hint }}</span>
  </label>
</template>
