<script setup lang="ts">
const steps = ['build', 'ligatures', 'longest', 'bare', 'okurigana'] as const
</script>

<template>
  <div class="overflow-hidden">
    <ol class="-mb-px -mr-px grid sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="(step, i) in steps"
        :key="step"
        class="flex flex-col gap-3 border-b border-r border-base p-8"
      >
        <span class="font-mono text-xs color-muted">{{ String(i + 1).padStart(2, '0') }}</span>
        <h3 class="text-base font-semibold tracking-tight">
          {{ $t(`how.${step}.title`) }}
        </h3>
        <p class="text-sm lh-1.625 color-muted">
          {{ $t(`how.${step}.body`) }}
        </p>
      </li>
    </ol>
  </div>
</template>
