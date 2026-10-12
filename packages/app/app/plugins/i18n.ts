import { createI18n } from 'vue-i18n'
import { messages } from '~/locales'

/** The interface speaks the visitor's language: their earlier choice, else the browser's. */
export default defineNuxtPlugin((nuxtApp) => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  nuxtApp.vueApp.use(createI18n({
    legacy: false,
    locale: isLocale(stored) ? stored : detectLocale(navigator.languages),
    fallbackLocale: 'en',
    messages,
  }))
})
