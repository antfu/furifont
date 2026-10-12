import type { Locale } from '../utils/locale'
import en from './en'
import ja from './ja'
import zhCN from './zh-CN'
import zhTW from './zh-TW'

export type Messages = typeof en

export const messages = { 'en': en, 'ja': ja, 'zh-CN': zhCN, 'zh-TW': zhTW } satisfies Record<Locale, Messages>

declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends Messages {}
}
