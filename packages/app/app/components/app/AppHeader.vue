<script setup lang="ts">
const { dark, toggle } = useDarkMode()

const links = [
  { to: '/', label: 'Demo' },
  { to: '/reference', label: 'Reference' },
  { to: '/studio', label: 'Studio' },
]
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-base bg-base">
    <nav class="relative mx-auto flex h-14 max-w-6xl items-center gap-6 border-x border-base px-6">
      <UiCross class="-bottom-[6px] -left-[6px]" />
      <UiCross class="-bottom-[6px] -right-[6px]" />
      <NuxtLink to="/" class="focus-ring flex items-center gap-2.5 font-mono text-sm font-medium">
        <span class="grid size-6 place-items-center bg-inverse font-furi text-sm color-inverse" aria-hidden="true">ふ</span>
        furifont
      </NuxtLink>
      <div class="flex items-center gap-1">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="focus-ring px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] color-muted transition-colors hover:color-base"
          active-class="!color-base"
        >
          {{ link.label }}
        </NuxtLink>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <a :href="REPOSITORY" target="_blank" rel="noopener" class="btn-ghost focus-ring w-9 px-0" aria-label="GitHub repository">
          <span class="i-ph-github-logo" />
        </a>
        <button type="button" class="btn-ghost focus-ring w-9 px-0" :aria-label="dark ? 'Switch to light' : 'Switch to dark'" @click="toggle">
          <span :class="dark ? 'i-ph-sun' : 'i-ph-moon'" />
        </button>
      </div>
    </nav>
  </header>
</template>
