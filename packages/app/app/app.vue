<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
useHead({
  htmlAttrs: { lang: locale },
  title: () => t('meta.title'),
  meta: [{ name: 'description', content: () => t('meta.description') }],
})
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-base font-sans color-base">
    <AppHeader />
    <main class="mx-auto max-w-6xl border-x border-base">
      <NuxtPage />
    </main>
    <AppFooter />
  </div>
</template>
