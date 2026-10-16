<script setup lang="ts">
defineProps<{
  /** Mono index, like `02`. */
  index?: string
  title?: string
  /** The title is a button that opens and closes the section; the body is mounted only while it is open. */
  expandable?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <section class="relative border-t border-base">
    <UiCross class="-left-[6px] -top-[6px]" />
    <UiCross class="-right-[6px] -top-[6px]" />
    <header v-if="title" class="flex items-baseline gap-3 border-b border-base px-6 py-3">
      <component :is="expandable ? 'button' : 'div'" :type="expandable ? 'button' : undefined" class="flex items-baseline gap-3 text-left" :class="expandable && 'focus-ring'" :aria-expanded="expandable ? open : undefined" @click="expandable && (open = !open)">
        <span v-if="index" class="label">{{ index }}</span>
        <h2 class="label color-base">
          {{ title }}
        </h2>
        <span v-if="expandable" class="i-ph-caret-right-bold self-center text-xs color-muted transition-transform" :class="open && 'rotate-90'" aria-hidden="true" />
      </component>
      <slot name="aside" />
    </header>
    <slot v-if="!expandable || open" />
  </section>
</template>
