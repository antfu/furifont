/// <reference lib="dom" />
// The userscript's server route imports this too, and its types have no DOM.
import type { Family } from './families'

declare global {
  interface Window {
    /** Furifont's stylesheet on the page, kept between clicks of the bookmarklet. */
    furifont?: { sheet: CSSStyleSheet, family: string }
  }
}

/**
 * Turns Furifont on or off on any page, or switches it to another family. The
 * bookmarklet and the userscript ship this function as source text, so it MUST
 * NOT use anything from outside its own body.
 *
 * The fallback font shows until Furifont arrives: from `url` once the page needs
 * it, or through `fetchFont`, which a userscript runs past the page's CSP.
 */
export async function toggleFurifont(
  { family, face }: Family,
  url: string,
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
  document.fonts.add(new FontFace(family, fetchFont ? await fetchFont(url) : `url("${url}")`, { display: 'swap' }))
}
