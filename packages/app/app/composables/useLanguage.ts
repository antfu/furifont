import { useI18n } from 'vue-i18n'

/** The interface language; choosing one remembers it over the browser's preference. */
export function useLanguage() {
  const { locale } = useI18n()
  return computed({
    get: () => locale.value,
    set: (code: string) => {
      if (!isLocale(code))
        return
      locale.value = code
      localStorage.setItem(LOCALE_STORAGE_KEY, code)
    },
  })
}
