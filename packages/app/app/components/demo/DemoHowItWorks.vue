<script setup lang="ts">
const steps = ['build', 'ligatures', 'longest', 'bare'] as const
</script>

<template>
  <ol class="grid sm:grid-cols-2 lg:grid-cols-4">
    <li
      v-for="(step, i) in steps"
      :key="step"
      class="flex flex-col gap-3 border-base p-6 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:not(:last-child)]:border-r"
    >
      <span class="font-mono text-xs color-muted">{{ String(i + 1).padStart(2, '0') }}</span>
      <h3 class="text-[15px] font-semibold tracking-tight">
        {{ $t(`how.${step}.title`) }}
      </h3>
      <p class="text-sm leading-relaxed color-muted">
        {{ $t(`how.${step}.body`) }}
      </p>
    </li>
  </ol>
</template>
