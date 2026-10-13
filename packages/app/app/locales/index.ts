import type { Locale } from '../utils/locale'
import en from './en'
import ja from './ja'
import zhHans from './zh-Hans'
import zhHant from './zh-Hant'

export type Messages = typeof en

export const messages = { 'en': en, 'ja': ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } satisfies Record<Locale, Messages>

declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends Messages {}
}
