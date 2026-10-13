<script setup lang="ts">
const { min, max } = defineProps<{
  min: number
  max: number
  step?: number
}>()
const model = defineModel<number>({ required: true })
</script>

<template>
  <input v-model.number="model" type="range" :min :max :step class="slider" :style="{ '--slider-fraction': (model - min) / (max - min) }">
</template>
