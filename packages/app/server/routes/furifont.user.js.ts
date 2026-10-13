import { version } from '../../../../package.json'

/** The userscript manager's functions, handed in so {@link start} can ship as source. */
interface Manager {
  getValue: (key: string, fallback: string) => string
  setValue: (key: string, value: string) => void
  registerMenuCommand: (caption: string, onClick: () => void) => void
  xmlHttpRequest: (details: {
    url: string
    responseType: 'arraybuffer'
    onload: (response: { response: ArrayBuffer }) => void
    onerror: () => void
  }) => void
}

/** Shipped as source text, like `toggleFurifont`: it MUST NOT use anything from outside its own body. */
function start(manager: Manager, toggle: typeof toggleFurifont, fonts: { family: Family, url: string }[]): void {
  // The manager fetches the font, so the page's CSP cannot block it.
  const fetchFont = (url: string): Promise<ArrayBuffer> => new Promise((resolve, reject) =>
    manager.xmlHttpRequest({ url, responseType: 'arraybuffer', onload: r => resolve(r.response), onerror: reject }))
  for (const { family, url } of fonts) {
    manager.registerMenuCommand(family.family, () => {
      manager.setValue('family', family.family)
      toggle(family, url, fetchFont)
    })
  }
  const saved = fonts.find(f => f.family.family === manager.getValue('family', '')) ?? fonts[0]!
  if (/^ja(?:-|$)/i.test(document.documentElement.lang))
    toggle(saved.family, saved.url, fetchFont)
}

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/javascript; charset=utf-8')
  const fonts = FAMILIES.map(family => ({ family, url: siteFontUrl(family) }))
  return `// ==UserScript==
// @name         Furifont
// @namespace    ${SITE}
// @version      ${version}
// @description  Furigana on any page: Furifont turns on by itself on Japanese pages, and the menu switches family or turns it off.
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

(${start})({ getValue: GM_getValue, setValue: GM_setValue, registerMenuCommand: GM_registerMenuCommand, xmlHttpRequest: GM_xmlhttpRequest }, ${toggleFurifont}, ${JSON.stringify(fonts)})
`
})
