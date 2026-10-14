<script setup lang="ts">
const steps = ['build', 'ligatures', 'longest', 'bare', 'okurigana'] as const
</script>

<template>
  <ol class="grid sm:grid-cols-2 lg:grid-cols-5">
    <li
      v-for="(step, i) in steps"
      :key="step"
      class="flex flex-col gap-3 border-base p-6 [&:not(:last-child)]:border-b sm:max-lg:[&:nth-child(odd):not(:last-child)]:border-r sm:max-lg:last:col-span-2 lg:border-b-0 lg:[&:not(:last-child)]:border-r"
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
