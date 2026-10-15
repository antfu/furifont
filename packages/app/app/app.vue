<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
useHead({
  htmlAttrs: { lang: locale },
  title: () => t('meta.title'),
  meta: [{ name: 'description', content: () => t('meta.description') }],
})

// The Japanese interface is set in the chosen font too, see tokens.css.
const { family, ruby } = useFontSettings()
watchEffect(() => {
  const { style } = document.documentElement
  style.setProperty('--ff-font', `"${family.value.family}"`)
  style.setProperty('--ff-features', ruby.value ? 'normal' : '"ss01"')
})
</script>

<template>
  <div class="min-h-screen flex flex-col overflow-x-clip bg-base color-base">
    <AppHeader />
    <!-- Grows, so a short page still keeps the footer at the bottom. -->
    <main class="mx-auto w-full max-w-6xl flex-1 border-x border-base">
      <NuxtPage />
    </main>
    <AppFooter />
  </div>
</template>
