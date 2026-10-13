import { createI18n } from 'vue-i18n'
import { en, loaders } from '~/locales'

/** The interface speaks the visitor's language: their earlier choice, else the browser's. */
export default defineNuxtPlugin(async (nuxtApp) => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  const locale = isLocale(stored) ? stored : detectLocale(navigator.languages)
  nuxtApp.vueApp.use(createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en, [locale]: await loaders[locale]() },
  }))
})
