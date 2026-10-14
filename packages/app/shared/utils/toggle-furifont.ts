/// <reference lib="dom" />
// The userscript's server route imports this too, and its types have no DOM.
import type { Family } from './families'

declare global {
  interface Window {
    /** Furifont's stylesheet on the page, kept between clicks of the bookmarklet. */
    furifont?: {
      sheet: CSSStyleSheet
      family: string
      /** Reads kanji before okurigana as the pairs say, or stops doing so with no `config`. */
      okurigana: (config?: Okurigana) => void
    }
  }
}

/** The words of the toast shown when Furifont cannot load, in the reader's language. */
export interface Toast {
  message: string
  download: string
  close: string
}

/**
 * Where a page finds what it needs to read 来 as こ in 来ない and き in 来ます,
 * or 一人 as ひとり in 一人も. The text cannot say it, since the font only sees
 * kanji, so the page wraps the run of kanji in a span and
 * `font-feature-settings: "salt" n` picks the nth reading, as the selector
 * after the first kanji does. The text itself stays plain.
 */
export interface Okurigana {
  /** The font's `.ivs.json`: the readings of a kanji, and of a word with several, in the order `salt` counts them. */
  readings: string
  /** The pairs, packed by run of kanji: `{ 来: { こ: ['ない'], き: ['ます'], '': ['に'] } }`, where `''` holds the okurigana that read two ways. */
  pairs: string
  /** Reads pairs from them. Handed in because this function ships as source text and cannot import it. */
  reader: typeof createOkuriganaReader
  /** Fetches the two files past the page's CSP, as a userscript can. */
  fetchText?: (url: string) => Promise<string>
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
 *
 * With `okurigana`, the kanji of verbs and adjectives, and the words before their okurigana, get their reading as well.
 * That is a bonus: when the files do not load, or the font predates `salt`,
 * the page is left as it is.
 */
export async function toggleFurifont(
  { family, face }: Family,
  url: string,
  toast: Toast,
  fetchFont?: (url: string) => Promise<ArrayBuffer>,
  okurigana?: Okurigana,
): Promise<void> {
  let state = window.furifont
  if (state?.family === family) {
    state.sheet.disabled = !state.sheet.disabled
    if (!state.sheet.disabled)
      state.okurigana(okurigana)
    return
  }
  if (!state) {
    const sheet = new CSSStyleSheet()
    // What the pairs and the font's readings made, or nothing while they are off or loading.
    let reader: OkuriganaReader | undefined
    // The newest request wins when families or settings change while files load.
    let latest = 0
    const files: Record<string, Promise<unknown>> = {}
    const fetchJson = (url: string, fetchText?: (url: string) => Promise<string>): Promise<unknown> => files[url] ??= (fetchText ? fetchText(url) : fetch(url).then(r => r.ok ? r.text() : Promise.reject(new Error(url)))).then(JSON.parse).catch((error) => {
      // So the next try loads it again.
      delete files[url]
      throw error
    })
    const load = async ({ readings, pairs, fetchText, reader: create }: Okurigana): Promise<OkuriganaReader | undefined> => {
      try {
        const [list, packed] = await Promise.all([fetchJson(readings, fetchText), fetchJson(pairs, fetchText)]) as [{ kanji: OkuriganaTables['readings'], words: OkuriganaTables['words'], lone: OkuriganaTables['lone'], salt?: boolean }, OkuriganaTables['pairs']]
        // Fonts built before `salt` have no alternates to pick.
        return list.salt === true ? create({ pairs: packed, readings: list.kanji, words: list.words, lone: list.lone }) : undefined
      }
      catch {
        return undefined
      }
    }
    // Spans keep the reading, so a family with another list, or a later switch back on, can set the value again.
    const refresh = (): void => {
      for (const span of document.querySelectorAll<HTMLElement>('[data-furifont-reading]')) {
        const salt = reader ? reader.saltOf(span.textContent ?? '', span.dataset.furifontReading!) : 0
        if (salt)
          span.dataset.furifontSalt = String(salt)
        else
          delete span.dataset.furifontSalt
      }
    }
    /** The text nodes under `roots` that hold a kanji before hiragana, apart from code and what a reader edits. */
    const textsIn = (roots: Node[]): Text[] => {
      const texts: Text[] = []
      for (const root of roots.filter(r => r.isConnected)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
          const parent = node.parentElement
          if (node.nodeType === Node.TEXT_NODE && parent && /\p{sc=Han}\p{sc=Hiragana}/u.test(node.nodeValue ?? '') && !parent.closest('script,style,textarea,noscript,[contenteditable]:not([contenteditable=false]),[data-furifont-reading]'))
            texts.push(node as Text)
        }
      }
      return texts
    }
    const annotate = (roots: Node[]): void => {
      if (!reader)
        return
      for (const text of textsIn(roots)) {
        // From the end, so the offsets before stay true.
        for (const { at, length, reading, salt } of reader.find(text.nodeValue ?? '').reverse()) {
          const run = at ? text.splitText(at) : text
          if (run.length > length)
            run.splitText(length)
          const span = document.createElement('span')
          span.dataset.furifontReading = reading
          span.dataset.furifontSalt = String(salt)
          run.replaceWith(span)
          span.append(run)
        }
      }
    }
    const setOkurigana = (config?: Okurigana): void => {
      const request = ++latest
      reader = undefined
      refresh()
      // Off, the spans stay but say nothing; a page that is off gets them when it is on.
      if (!config || sheet.disabled)
        return
      load(config).then((loaded) => {
        if (request !== latest || !loaded)
          return
        reader = loaded
        refresh()
        annotate([document.body])
      })
    }
    state = { sheet, family, okurigana: setOkurigana }
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
    new MutationObserver((records) => {
      const roots = records.flatMap(r => r.type === 'characterData' ? [r.target] : [...r.addedNodes])
      mark(roots)
      annotate(roots)
    }).observe(document.body, { childList: true, characterData: true, subtree: true })
  }
  state.family = family
  // `salt` n is the nth reading: the font counts up to 15 of them.
  const salts = Array.from({ length: 15 }, (_, i) => `[data-furifont-salt="${i + 1}"]{font-feature-settings:"salt" ${i + 1}!important}`).join('')
  state.sheet.replaceSync(`*{font-family:"${family}",${face === 'sans' ? 'sans-serif' : 'serif'}!important}[data-furifont]{line-height:normal!important}${salts}`)
  state.sheet.disabled = false
  // An installed Furifont needs no download: Chromium and Firefox find it by its full name, WebKit by its family.
  // With no web font of that family, the page's CSS then picks the installed one, every weight of it.
  if (await new FontFace(family, `local("${family} Regular"),local("${family}")`).load().then(() => true, () => false)) {
    state.okurigana(okurigana)
    return
  }
  try {
    document.fonts.add(await new FontFace(family, fetchFont ? await fetchFont(url) : `url("${url}")`).load())
    state.okurigana(okurigana)
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
