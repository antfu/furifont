<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
    <input v-model="model" type="checkbox" class="peer sr-only">
    <span
      class="relative h-4 w-7 border border-strong transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ff-fg)]"
      :class="model ? 'bg-inverse' : 'bg-base'"
    >
      <span class="absolute top-[2px] size-[10px] transition-all" :class="model ? 'left-[14px] bg-base' : 'left-[2px] bg-inverse'" />
    </span>
    <slot />
  </label>
</template>
