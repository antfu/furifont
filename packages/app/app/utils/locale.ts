export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
] as const

export type Locale = typeof LOCALES[number]['code']

export const LOCALE_STORAGE_KEY = 'furifont:locale'

export function isLocale(value: string | null): value is Locale {
  return LOCALES.some(l => l.code === value)
}

/**
 * The first supported language among the browser's preferences. Chinese for
 * Taiwan, Hong Kong and Macau, or marked Hant, is Traditional; other Chinese
 * is Simplified.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages.map(l => l.toLowerCase())) {
    if (tag.startsWith('zh'))
      return /-(?:tw|hk|mo|hant)\b/.test(tag) ? 'zh-TW' : 'zh-CN'
    if (tag.startsWith('ja'))
      return 'ja'
    if (tag.startsWith('en'))
      return 'en'
  }
  return 'en'
}
