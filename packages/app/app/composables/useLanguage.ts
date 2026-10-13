import { useI18n } from 'vue-i18n'
import { loaders } from '~/locales'

/** The interface language; choosing one loads it, then remembers it over the browser's preference. */
export function useLanguage() {
  const { locale, availableLocales, setLocaleMessage } = useI18n()
  return computed({
    get: () => locale.value,
    set: async (code: string) => {
      if (!isLocale(code))
        return
      if (!availableLocales.includes(code))
        setLocaleMessage(code, await loaders[code]())
      locale.value = code
      localStorage.setItem(LOCALE_STORAGE_KEY, code)
    },
  })
}
