import type { Locale } from '../utils/locale'
import enMessages from './en.json'

export const en = enMessages

export type Messages = typeof enMessages

/** English is bundled as the fallback; the other locales load on demand. */
export const loaders = {
  'en': async () => enMessages,
  'ja': async () => (await import('./ja.json')).default,
  'zh-Hans': async () => (await import('./zh-Hans.json')).default,
  'zh-Hant': async () => (await import('./zh-Hant.json')).default,
} satisfies Record<Locale, () => Promise<Messages>>

declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends Messages {}
}
