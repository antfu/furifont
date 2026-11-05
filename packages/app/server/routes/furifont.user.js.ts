/// <reference lib="dom" />
// The userscript runs `start` in pages; the server types have no DOM.
import type { FurifontOptions, PanelLabels, PanelState, showPanel, SiteMode, Toast, toggleFurifont, Update } from '@furifont/helper-web'
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

const PANELS = {
  'en': en.anyPage.panel,
  'ja': ja.anyPage.panel,
  'zh-Hans': zhHans.anyPage.panel,
  'zh-Hant': zhHant.anyPage.panel,
} satisfies Record<Locale, PanelLabels>

/** The captions of the menu commands that hold a setting, one for each state it can be in. */
interface Menu {
  okuriganaOn: string
  okuriganaOff: string
  siteAuto: string
  siteOn: string
  siteOff: string
  buttonOn: string
  buttonOff: string
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

/**
 * What a reader chose for one site, saved as JSON under `site:<hostname>`. A
 * setting the site lacks falls back to the reader's last choice anywhere.
 */
interface Site {
  /** `auto`, or nothing, turns Furifont on for Japanese pages only. */
  mode?: SiteMode
  family?: string
  okurigana?: boolean
}

/** Shipped as source text: it MUST NOT use anything from outside its own body. */
function start(
  manager: Manager,
  toggle: typeof toggleFurifont,
  panel: typeof showPanel,
  fonts: { family: string, url: string, readings: string }[],
  pairs: string,
  script: Pick<Update, 'version' | 'href'>,
  toasts: typeof TOASTS,
  menus: Record<Locale, Menu>,
  panels: Record<Locale, PanelLabels>,
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

  const siteKey = `site:${location.hostname}`
  const readSite = (): Site => {
    try {
      const site: unknown = JSON.parse(manager.getValue(siteKey, '{}'))
      return site && typeof site === 'object' ? site as Site : {}
    }
    catch {
      return {}
    }
  }
  const site = readSite()
  /** Saves `change` for this site, and its family and okurigana as the default for sites with none of their own. */
  const save = (change: Site): void => {
    Object.assign(site, change)
    manager.setValue(siteKey, JSON.stringify(site))
    if (change.family !== undefined)
      manager.setValue('family', change.family)
    if (change.okurigana !== undefined)
      manager.setValue('okurigana', change.okurigana ? 'on' : 'off')
  }

  // On unless the reader turned it off.
  let okurigana = site.okurigana ?? manager.getValue('okurigana', 'on') !== 'off'
  const options = ({ family, url, readings }: typeof fonts[number]): FurifontOptions => ({ family, url, toast, fetchFont, okurigana: okurigana ? { readings, pairs, fetchText } : undefined })
  const saved = (): typeof fonts[number] => fonts.find(f => f.family === (site.family ?? manager.getValue('family', ''))) ?? fonts[0]!
  const isOn = (): boolean => !!window.furifont?.family && !window.furifont.sheet.disabled
  const onPage = (): typeof fonts[number] | undefined => fonts.find(f => f.family === window.furifont?.family)

  // The corner button, unless the reader hid it; every change shows on it.
  let corner: ReturnType<typeof showPanel> | undefined
  const state = (): PanelState => ({ on: isOn(), mode: site.mode ?? 'auto', family: (isOn() ? onPage() : undefined)?.family ?? saved().family, okurigana })
  const refresh = (): void => {
    corner?.update(state())
    registerOkurigana()
    registerSite()
  }
  // `toggle` flips the family on the page; a font that fails to load turns back off after it.
  const run = (font: typeof fonts[number], check = false): void => {
    void toggle({ ...options(font), update: check ? update() : undefined }).then(refresh)
    refresh()
  }
  /** Turns Furifont on in the saved family, or off. */
  const turn = (on: boolean): void => {
    if (on === isOn())
      return
    const font = on ? saved() : onPage()
    if (font)
      run(font, on)
  }
  const isJapanese = (): boolean => /^ja(?:-|$)/i.test(document.documentElement.lang)
  const wanted = (): boolean => site.mode === 'on' || (site.mode !== 'off' && isJapanese())
  const setOkurigana = (value: boolean): void => {
    okurigana = value
    save({ okurigana })
    // The family on the page, if Furifont is on: otherwise the setting waits for it.
    const font = onPage()
    if (font)
      window.furifont?.okurigana(options(font).okurigana)
    refresh()
  }
  const setMode = (mode: SiteMode): void => {
    save({ mode })
    turn(wanted())
    refresh()
  }
  /** Saves `family`, and switches to it if Furifont is on in another. */
  const setFamily = (family: string): void => {
    const font = fonts.find(f => f.family === family)
    if (!font)
      return
    save({ family })
    if (isOn() && onPage() !== font)
      run(font)
    refresh()
  }

  for (const font of fonts) {
    manager.registerMenuCommand(font.family, () => {
      save({ family: font.family })
      run(font, true)
    })
  }
  function registerOkurigana(): void {
    manager.registerMenuCommand(okurigana ? menu.okuriganaOn : menu.okuriganaOff, () => setOkurigana(!okurigana), { id: 'okurigana', autoClose: false })
  }
  const modes = { auto: menu.siteAuto, on: menu.siteOn, off: menu.siteOff }
  // Auto, then always on, then always off.
  function registerSite(): void {
    manager.registerMenuCommand(modes[site.mode ?? 'auto'], () => setMode(site.mode === 'on' ? 'off' : site.mode === 'off' ? 'auto' : 'on'), { id: 'site', autoClose: false })
  }
  const showCorner = (): void => {
    corner = manager.getValue('button', 'on') === 'off'
      ? undefined
      : panel({
          labels: panels[locale],
          families: fonts.map(f => f.family),
          state: state(),
          onChange: (change) => {
            if (change.on !== undefined)
              turn(change.on)
            if (change.mode)
              setMode(change.mode)
            if (change.family)
              setFamily(change.family)
            if (change.okurigana !== undefined)
              setOkurigana(change.okurigana)
          },
          onHide: () => {
            manager.setValue('button', 'off')
            hideCorner()
          },
        })
    registerButton()
  }
  function hideCorner(): void {
    corner?.remove()
    corner = undefined
    registerButton()
  }
  function registerButton(): void {
    manager.registerMenuCommand(corner ? menu.buttonOn : menu.buttonOff, () => {
      manager.setValue('button', corner ? 'off' : 'on')
      if (corner)
        hideCorner()
      else
        showCorner()
    }, { id: 'button', autoClose: false })
  }
  registerOkurigana()
  registerSite()
  showCorner()
  if (wanted())
    turn(true)
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
// @description  Furigana on any page: Furifont turns on by itself on Japanese pages, and the menu switches family, turns it off, keeps it on or off for a site, or turns okurigana readings (来る, 来ない) off, as does a button in the page's corner. Each site remembers its own settings.
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
;(${start})({ getValue: GM_getValue, setValue: GM_setValue, registerMenuCommand: GM_registerMenuCommand, xmlHttpRequest: GM_xmlhttpRequest }, Furifont.toggleFurifont, Furifont.showPanel, ${JSON.stringify(fonts)}, ${JSON.stringify(SITE_PAIRS_URL)}, ${JSON.stringify({ version: VERSION, href: `${SITE}/furifont.user.js` })}, ${JSON.stringify(TOASTS)}, ${JSON.stringify(MENUS)}, ${JSON.stringify(PANELS)}, ${detectLocale})
})()
`
})
