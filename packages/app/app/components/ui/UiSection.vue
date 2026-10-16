<script setup lang="ts">
defineProps<{
  /** Mono index, like `02`. */
  index?: string
  title?: string
}>()
</script>

<template>
  <section class="relative border-t border-base">
    <UiCross class="-left-[6px] -top-[6px]" />
    <UiCross class="-right-[6px] -top-[6px]" />
    <header v-if="title" class="flex items-baseline gap-3 border-b border-base px-6 py-3">
      <span v-if="index" class="label">{{ index }}</span>
      <h2 class="label color-base">
        {{ title }}
      </h2>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>
