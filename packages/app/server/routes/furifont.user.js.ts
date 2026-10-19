/// <reference lib="dom" />
// The userscript runs `start` in pages; the server types have no DOM.
import type { FurifontOptions, Toast, toggleFurifont, Update } from '@furifont/helper-web'
import en from '../../app/locales/en.json'
import ja from '../../app/locales/ja.json'
import zhHans from '../../app/locales/zh-Hans.json'
import zhHant from '../../app/locales/zh-Hant.json'

const TOASTS = {
  'en': en.anyPage.toast,
  'ja': ja.anyPage.toast,
  'zh-Hans': zhHans.anyPage.toast,
  'zh-Hant': zhHant.anyPage.toast,
} satisfies Record<Locale, Toast & { userscript: string }>

const MENUS = {
  'en': en.anyPage.menu,
  'ja': ja.anyPage.menu,
  'zh-Hans': zhHans.anyPage.menu,
  'zh-Hant': zhHant.anyPage.menu,
} satisfies Record<Locale, Menu>

/** The caption of the menu command that turns okurigana readings on or off, for the state it is in. */
interface Menu {
  okuriganaOn: string
  okuriganaOff: string
}

/** The userscript manager's functions, handed in so {@link start} can ship as source. */
interface Manager {
  getValue: (key: string, fallback: string) => string
  setValue: (key: string, value: string) => void
  /** With the same `id`, a manager replaces the caption of its command. */
  registerMenuCommand: (caption: string, onClick: () => void, options?: { id: string, autoClose: boolean }) => void
  xmlHttpRequest: (details: {
    url: string
    responseType: 'arraybuffer' | 'text'
    onload: (response: { response: ArrayBuffer | string }) => void
    onerror: () => void
  }) => void
}

/** Shipped as source text: it MUST NOT use anything from outside its own body. */
function start(
  manager: Manager,
  toggle: typeof toggleFurifont,
  fonts: { family: string, url: string, readings: string }[],
  pairs: string,
  script: Pick<Update, 'version' | 'href'>,
  toasts: typeof TOASTS,
  menus: Record<Locale, Menu>,
  detect: typeof detectLocale,
): void {
  const locale = detect(navigator.languages)
  const toast = toasts[locale]
  const menu = menus[locale]
  // The manager fetches the files, so the page's CSP cannot block them.
  const fetchBytes = <T extends ArrayBuffer | string>(url: string, responseType: 'arraybuffer' | 'text'): Promise<T> => new Promise((resolve, reject) =>
    manager.xmlHttpRequest({ url, responseType, onload: r => resolve(r.response as T), onerror: reject }))
  const fetchFont = (url: string): Promise<ArrayBuffer> => fetchBytes(url, 'arraybuffer')
  const fetchText = (url: string): Promise<string> => fetchBytes(url, 'text')
  // Once a day at most, as Furifont turns on.
  const update = (): Update | undefined => {
    if (Date.now() - Number(manager.getValue('checked', '0')) < 86_400_000)
      return undefined
    manager.setValue('checked', String(Date.now()))
    return { ...script, text: toast.userscript, fetchText }
  }
  // On unless the reader turned it off.
  let okurigana = manager.getValue('okurigana', 'on') !== 'off'
  const options = ({ family, url, readings }: typeof fonts[number]): FurifontOptions => ({ family, url, toast, fetchFont, okurigana: okurigana ? { readings, pairs, fetchText } : undefined })
  const saved = fonts.find(f => f.family === manager.getValue('family', '')) ?? fonts[0]!
  for (const font of fonts) {
    manager.registerMenuCommand(font.family, () => {
      manager.setValue('family', font.family)
      toggle({ ...options(font), update: update() })
    })
  }
  const registerOkurigana = (): void => manager.registerMenuCommand(okurigana ? menu.okuriganaOn : menu.okuriganaOff, () => {
    okurigana = !okurigana
    manager.setValue('okurigana', okurigana ? 'on' : 'off')
    // The family on the page, if Furifont is on: otherwise the setting waits for it.
    const font = fonts.find(f => f.family === window.furifont?.family)
    if (font)
      window.furifont?.okurigana(options(font).okurigana)
    registerOkurigana()
  }, { id: 'okurigana', autoClose: false })
  registerOkurigana()
  if (/^ja(?:-|$)/i.test(document.documentElement.lang))
    toggle({ ...options(saved), update: update() })
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'content-type', 'text/javascript; charset=utf-8')
  const fonts = FAMILIES.map(family => ({ family: family.family, url: siteFontUrl(family), readings: siteReadingsUrl(family) }))
  // @furifont/helper-web's IIFE build, which puts the engine on `Furifont`.
  const engine = String(await useStorage('assets:helper-web').getItemRaw('index.iife.js'))
  return `// ==UserScript==
// @name         Furifont
// @namespace    ${SITE}
// @version      ${VERSION}
// @description  Furigana on any page: Furifont turns on by itself on Japanese pages, and the menu switches family, turns it off, or turns okurigana readings (来る, 来ない) off.
// @homepageURL  ${SITE}
// @downloadURL  ${SITE}/furifont.user.js
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      ${new URL(SITE).host}
// ==/UserScript==

/* eslint-disable */
(() => {
${engine}
;(${start})({ getValue: GM_getValue, setValue: GM_setValue, registerMenuCommand: GM_registerMenuCommand, xmlHttpRequest: GM_xmlhttpRequest }, Furifont.toggleFurifont, ${JSON.stringify(fonts)}, ${JSON.stringify(SITE_PAIRS_URL)}, ${JSON.stringify({ version: VERSION, href: `${SITE}/furifont.user.js` })}, ${JSON.stringify(TOASTS)}, ${JSON.stringify(MENUS)}, ${detectLocale})
})()
`
})
