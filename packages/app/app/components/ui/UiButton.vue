<script setup lang="ts">
const { variant = 'outline', to, href } = defineProps<{
  variant?: 'solid' | 'outline' | 'ghost'
  /** App route. */
  to?: string
  /** External link, opened in a new tab. */
  href?: string
  icon?: string
}>()

const classes = computed(() => [`btn-${variant}`, 'focus-ring'])
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes">
    <span v-if="icon" :class="icon" />
    <slot />
  </NuxtLink>
  <a v-else-if="href" :href="href" target="_blank" rel="noopener" :class="classes">
    <span v-if="icon" :class="icon" />
    <slot />
  </a>
  <button v-else type="button" :class="classes">
    <span v-if="icon" :class="icon" />
    <slot />
  </button>
</template>
