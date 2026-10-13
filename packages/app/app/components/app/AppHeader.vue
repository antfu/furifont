<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { dark, toggle } = useDarkMode()
const { ruby, toggle: toggleRuby } = useSiteRuby()
const { locale } = useI18n()

const links = [
  { to: '/', label: 'nav.demo' },
  { to: '/reference', label: 'nav.reference' },
  { to: '/studio', label: 'nav.studio' },
] as const
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-base bg-base">
    <nav class="relative mx-auto flex h-14 max-w-6xl items-center gap-3 border-x border-base px-3 sm:gap-6 sm:px-6">
      <UiCross class="-bottom-[6px] -left-[6px]" />
      <UiCross class="-bottom-[6px] -right-[6px]" />
      <NuxtLink to="/" class="focus-ring flex items-center gap-2.5 font-mono text-sm font-medium">
        <img src="/logo.svg" alt="" class="size-6" :class="{ invert: dark }" aria-hidden="true">
        <span class="hidden sm:inline">furifont</span>
      </NuxtLink>
      <div class="flex items-center gap-1">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="focus-ring whitespace-nowrap px-1 py-1 font-mono text-xs uppercase tracking-[0.04em] color-muted transition-colors hover:color-base sm:px-2 sm:tracking-[0.12em]"
          active-class="!color-base"
        >
          {{ $t(link.label) }}
        </NuxtLink>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <AppLanguageSelect />
        <button v-if="locale === 'ja'" type="button" class="btn-ghost focus-ring w-9 px-0" :aria-label="ruby ? $t('nav.rubyOff') : $t('nav.rubyOn')" :title="ruby ? $t('nav.rubyOff') : $t('nav.rubyOn')" :aria-pressed="ruby" @click="toggleRuby">
          <span :class="ruby ? 'i-ph-eye' : 'i-ph-eye-slash'" />
        </button>
        <a :href="REPOSITORY" target="_blank" rel="noopener" class="btn-ghost focus-ring hidden w-9 px-0 sm:inline-flex" :aria-label="$t('nav.github')">
          <span class="i-ph-github-logo" />
        </a>
        <button type="button" class="btn-ghost focus-ring w-9 px-0" :aria-label="dark ? $t('nav.light') : $t('nav.dark')" @click="toggle">
          <span :class="dark ? 'i-ph-sun' : 'i-ph-moon'" />
        </button>
      </div>
    </nav>
  </header>
</template>
