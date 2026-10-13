/// <reference lib="dom" />
// The userscript's server route imports this too, and its types have no DOM.
import type { Family } from './families'

declare global {
  interface Window {
    /** Furifont's stylesheet on the page, kept between clicks of the bookmarklet. */
    furifont?: { sheet: CSSStyleSheet, family: string }
  }
}

/** The words of the toast shown when Furifont cannot load, in the reader's language. */
export interface Toast {
  message: string
  download: string
  close: string
}

/**
 * Turns Furifont on or off on any page, or switches it to another family. The
 * bookmarklet and the userscript ship this function as source text, so it MUST
 * NOT use anything from outside its own body.
 *
 * An installed Furifont needs no download. Otherwise the fallback font shows
 * until Furifont arrives, from `url` or through `fetchFont`, which a userscript
 * runs past the page's CSP. When both fail, as on a site whose CSP blocks fonts
 * from other sites, Furifont turns back off and a toast asks to install it.
 */
export async function toggleFurifont(
  { family, face }: Family,
  url: string,
  toast: Toast,
  fetchFont?: (url: string) => Promise<ArrayBuffer>,
): Promise<void> {
  let state = window.furifont
  if (state?.family === family) {
    state.sheet.disabled = !state.sheet.disabled
    return
  }
  if (!state) {
    state = { sheet: new CSSStyleSheet(), family }
    window.furifont = state
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, state.sheet]
    // Ruby needs a line height of about 1.6: mark the tighter elements that hold kanji, now and later.
    const mark = (roots: Node[]): void => {
      const parents = new Set<Element>()
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
          if (node.parentElement && /\p{sc=Han}/u.test(node.nodeValue ?? ''))
            parents.add(node.parentElement)
        }
      }
      // Every read before any write, or each write forces another style pass.
      const tight = [...parents].filter((element) => {
        const { lineHeight, fontSize } = getComputedStyle(element)
        return Number.parseFloat(lineHeight) < 1.6 * Number.parseFloat(fontSize)
      })
      for (const element of tight)
        element.setAttribute('data-furifont', '')
    }
    mark([document.body])
    new MutationObserver(records => mark(records.flatMap(r => r.type === 'characterData' ? [r.target] : [...r.addedNodes])))
      .observe(document.body, { childList: true, characterData: true, subtree: true })
  }
  state.family = family
  state.sheet.replaceSync(`*{font-family:"${family}",${face === 'sans' ? 'sans-serif' : 'serif'}!important}[data-furifont]{line-height:normal!important}`)
  state.sheet.disabled = false
  // An installed Furifont needs no download: Chromium and Firefox find it by its full name, WebKit by its family.
  // With no web font of that family, the page's CSS then picks the installed one, every weight of it.
  if (await new FontFace(family, `local("${family} Regular"),local("${family}")`).load().then(() => true, () => false))
    return
  try {
    document.fonts.add(await new FontFace(family, fetchFont ? await fetchFont(url) : `url("${url}")`).load())
  }
  catch {
    state.sheet.disabled = true
    // So the next click tries again.
    state.family = ''
    document.querySelector('furifont-toast')?.remove()
    // In a shadow root, the page's CSS leaves the toast alone.
    const host = document.createElement('furifont-toast')
    const root = host.attachShadow({ mode: 'open' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`:host{all:initial}div{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:16px;align-items:start;max-width:360px;padding:12px 16px;border:1px solid #fafafa2b;background:#0a0a0a;color:#fafafa;font:14px/1.5 system-ui,sans-serif}p{margin:0}a{color:inherit}button{padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}`)
    root.adoptedStyleSheets = [sheet]
    // The site that serves the font lists the downloads.
    const link = Object.assign(document.createElement('a'), { href: new URL('/#downloads', url).href, target: '_blank', rel: 'noopener', textContent: toast.download })
    const close = Object.assign(document.createElement('button'), { ariaLabel: toast.close, textContent: '×', onclick: () => host.remove() })
    const message = document.createElement('p')
    message.append(toast.message, ' ', link)
    const box = Object.assign(document.createElement('div'), { role: 'alert' })
    box.append(message, close)
    root.append(box)
    document.body.append(host)
    setTimeout(() => host.remove(), 10_000)
  }
}
