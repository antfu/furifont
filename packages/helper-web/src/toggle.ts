/// <reference lib="dom" />
import type { FontSource } from './load'
import type { Okurigana, OkuriganaReader } from './okurigana'
import type { Toast } from './toast'
import type { Update } from './version'
import { loadFurifont } from './load'
import { loadOkuriganaReader } from './okurigana'
import { familyName, isMonospace, JAPANESE, parseFontStack } from './stack'
import { downloadLink, showToast } from './toast'
import { showUpdates } from './version'

declare global {
  interface Window {
    /** Furifont on the page, kept between clicks of the bookmarklet: each click runs its own copy of this code. */
    furifont?: {
      sheet: CSSStyleSheet
      family: string
      /** Writes the sheet again for `family`. */
      restyle: () => void
      /** Turns Furifont on the page on, or off with the page as it was before; `sheet.disabled` says which. */
      turn: (on: boolean) => void
      /** Reads kanji before okurigana as the pairs say, or stops doing so with no `config`. */
      okurigana: (config?: Okurigana) => void
      /** Stops watching the page and takes Furifont off it, as it was before. */
      dispose: () => void
    }
  }
}

type State = NonNullable<Window['furifont']>

export interface FurifontOptions extends FontSource {
  toast: Toast
  /** With it, the kanji of verbs and adjectives, and the words before their okurigana, get their reading as well. */
  okurigana?: Okurigana
  /** With it, a toast says when the script or the installed font is older than the site's release. */
  update?: Update
}

/** The text nodes under `roots` that sit in an element. */
function textsIn(roots: Node[]): Text[] {
  const texts: Text[] = []
  for (const root of roots.filter(r => r.isConnected)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
      // The walker starts at the root, which can be an element.
      if (node.nodeType === Node.TEXT_NODE && node.parentElement)
        texts.push(node as Text)
    }
  }
  return texts
}

/** The elements under `roots` that hold Japanese, or where a reader types it. */
function holdersIn(roots: Node[]): Set<Element> {
  const elements = new Set<Element>(textsIn(roots).filter(text => JAPANESE.test(text.nodeValue ?? '')).map(text => text.parentElement!))
  for (const root of roots) {
    if (root.nodeType !== Node.ELEMENT_NODE)
      continue
    // By node type, not `instanceof`, which a userscript's sandbox can break.
    const element = root as Element
    if (element.matches('input,textarea'))
      elements.add(element)
    for (const field of element.querySelectorAll('input,textarea'))
      elements.add(field)
  }
  return elements
}

/** How long the page's changes gather before Furifont marks them: a page that streams text, as a chat does, changes many times a second. */
const MARK_DELAY = 100
/** How long text must stay still before its kanji get their okurigana reading, so text a page is still writing is left alone. */
const ANNOTATE_DELAY = 500
/** The longest a page that never stops changing holds the readings back. */
const ANNOTATE_MAX_DELAY = 3000

/** The roots of `nodes` that are on the page and inside none of the others. */
function outermost(nodes: Set<Node>): Node[] {
  return [...nodes].filter((node) => {
    if (!node.isConnected)
      return false
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (nodes.has(parent))
        return false
    }
    return true
  })
}

/**
 * Sets the page's Japanese text in Furifont from now on, as elements come and
 * go. Each element keeps its own font stack behind Furifont, and Furifont draws
 * only Japanese, so Latin text and icon fonts stay as they were. Code keeps its
 * monospaced font.
 *
 * Off, it leaves the page as it was: it stops watching, and takes off its
 * attributes and spans.
 */
function install(family: string): State {
  const sheet = new CSSStyleSheet()
  sheet.disabled = true
  // The page's font stacks: an element's `data-furifont` is the index of its own.
  const stacks: string[] = []
  // The elements already looked at, marked or not, so a change inside one does not read its style again.
  let seen = new WeakSet<Element>()
  // What the pairs and the font's readings made, or nothing while they are off or loading.
  let reader: OkuriganaReader | undefined
  // The newest request wins when families or settings change while files load.
  let latest = 0

  const state: State = {
    sheet,
    family,
    restyle: (): void => {
      // `salt` n is the nth reading: the font counts up to 15 of them.
      const salts = Array.from({ length: 15 }, (_, i) => `[data-furifont-salt="${i + 1}"]{font-feature-settings:"salt" ${i + 1}!important}`).join('')
      const fonts = stacks.map((stack, i) => `[data-furifont="${i}"]{font-family:"${state.family}",${stack}!important}`).join('')
      // Ruby needs a line height of about 1.6. Text the page already sets in ruby gets the plain kanji of `ss01`.
      sheet.replaceSync(`${fonts}[data-furifont-tight]{line-height:normal!important}ruby,ruby *{font-feature-settings:"ss01"!important}${salts}`)
    },
    turn: () => {},
    okurigana: () => {},
    dispose: () => {},
  }

  // The text Furifont split off the page's own text nodes, to put back on them.
  const pieces = new WeakSet<Node>()

  /**
   * Takes the okurigana spans off, and joins the text they split, so 来ない is
   * one text node again for the next reader. Only Furifont's pieces join: the
   * page's own nodes, which a framework can hold, stay as they were.
   */
  const unwrap = (): void => {
    const parents = new Set<Node>()
    for (const span of document.querySelectorAll('[data-furifont-reading]')) {
      if (span.parentNode)
        parents.add(span.parentNode)
      span.replaceWith(...span.childNodes)
    }
    for (const parent of parents) {
      for (const node of [...parent.childNodes]) {
        const before = node.previousSibling
        if (pieces.has(node) && before?.nodeType === Node.TEXT_NODE) {
          (before as Text).appendData(node.nodeValue ?? '')
          node.remove()
        }
      }
    }
  }

  const annotate = (roots: Node[]): void => {
    if (!reader)
      return
    // A kanji before hiragana, apart from code and what a reader edits.
    const texts = textsIn(roots).filter(text => /\p{sc=Han}\p{sc=Hiragana}/u.test(text.nodeValue ?? '') && !text.parentElement!.closest('script,style,textarea,noscript,ruby,[contenteditable]:not([contenteditable=false]),[data-furifont-reading]'))
    for (const text of texts) {
      // From the end, so the offsets before stay true.
      for (const { at, length, reading, salt } of reader.find(text.nodeValue ?? '').reverse()) {
        const run = at ? text.splitText(at) : text
        if (at)
          pieces.add(run)
        if (run.length > length)
          pieces.add(run.splitText(length))
        const span = document.createElement('span')
        span.dataset.furifontReading = reading
        span.dataset.furifontSalt = String(salt)
        run.replaceWith(span)
        span.append(run)
      }
    }
  }

  /** Puts Furifont in front of the font stack of each element under `roots` that holds Japanese. */
  const mark = (roots: Node[]): void => {
    // Every read before any write, or each write forces another style pass.
    const found = [...holdersIn(roots)].filter(e => !seen.has(e) && !e.hasAttribute('data-furifont')).map((element) => {
      seen.add(element)
      const { fontFamily, lineHeight, fontSize } = getComputedStyle(element)
      const stack = parseFontStack(fontFamily)
      // Inside an element Furifont sets, a stack starts with Furifont, and the page's comes after it.
      if (familyName(stack[0] ?? '') === state.family)
        stack.shift()
      return { element, stack, tight: Number.parseFloat(lineHeight) < 1.6 * Number.parseFloat(fontSize) }
    }).filter(({ stack }) => stack.length && !isMonospace(stack))
    const known = stacks.length
    for (const { element, stack, tight } of found) {
      const value = stack.join(',')
      const index = stacks.includes(value) ? stacks.indexOf(value) : stacks.push(value) - 1
      element.setAttribute('data-furifont', String(index))
      if (tight)
        element.setAttribute('data-furifont-tight', '')
    }
    if (stacks.length > known)
      state.restyle()
  }

  // The page's changes wait in these, so a burst of them costs one pass.
  const toMark = new Set<Node>()
  const toAnnotate = new Set<Node>()
  let markTimer: ReturnType<typeof setTimeout> | undefined
  let annotateTimer: ReturnType<typeof setTimeout> | undefined
  let annotateSince = 0

  const queue = (records: MutationRecord[]): void => {
    if (sheet.disabled)
      return
    for (const record of records) {
      for (const node of record.type === 'characterData' ? [record.target] : record.addedNodes) {
        toMark.add(node)
        if (reader)
          toAnnotate.add(node)
      }
    }
    if (toMark.size)
      markTimer ??= setTimeout(flushMark, MARK_DELAY)
    if (toAnnotate.size) {
      // Each change puts the readings off again, up to a limit.
      annotateSince ||= Date.now()
      clearTimeout(annotateTimer)
      annotateTimer = setTimeout(flushAnnotate, Math.max(0, Math.min(ANNOTATE_DELAY, annotateSince + ANNOTATE_MAX_DELAY - Date.now())))
    }
  }

  const observer = new MutationObserver(queue)

  /** Runs `work`, and forgets the changes it made, so Furifont never answers its own spans. */
  const quietly = (work: () => void): void => {
    queue(observer.takeRecords())
    work()
    observer.takeRecords()
  }

  function flushMark(): void {
    markTimer = undefined
    const roots = outermost(toMark)
    toMark.clear()
    quietly(() => mark(roots))
  }

  function flushAnnotate(): void {
    annotateTimer = undefined
    annotateSince = 0
    const roots = outermost(toAnnotate)
    toAnnotate.clear()
    quietly(() => annotate(roots))
  }

  /** Drops the changes still waiting. */
  const cancel = (): void => {
    clearTimeout(markTimer)
    clearTimeout(annotateTimer)
    markTimer = annotateTimer = undefined
    annotateSince = 0
    toMark.clear()
    toAnnotate.clear()
  }

  state.turn = (on: boolean): void => {
    if (on === !sheet.disabled)
      return
    sheet.disabled = !on
    if (on) {
      mark([document.body])
      observer.observe(document.body, { childList: true, characterData: true, subtree: true })
      return
    }
    observer.disconnect()
    cancel()
    // Settings that are still loading must not apply.
    latest++
    reader = undefined
    unwrap()
    for (const element of document.querySelectorAll('[data-furifont],[data-furifont-tight]')) {
      element.removeAttribute('data-furifont')
      element.removeAttribute('data-furifont-tight')
    }
    seen = new WeakSet()
  }
  state.okurigana = (config?: Okurigana): void => {
    const request = ++latest
    reader = undefined
    toAnnotate.clear()
    // Another family counts its readings its own way, so the spans start over.
    quietly(unwrap)
    // A page that is off gets them when it is on.
    if (!config || sheet.disabled)
      return
    loadOkuriganaReader(config).then((loaded) => {
      if (request !== latest || !loaded)
        return
      reader = loaded
      quietly(() => annotate([document.body]))
    })
  }
  state.dispose = (): void => {
    state.turn(false)
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet)
    if (window.furifont === state)
      delete window.furifont
  }

  window.furifont = state
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  return state
}

/**
 * Turns Furifont on or off on any page, or switches it to another family: what
 * the bookmarklet and the userscript run.
 *
 * The page's fonts show until Furifont arrives. When it cannot, as on a site
 * whose CSP blocks fonts from other sites, Furifont turns back off and a toast
 * asks to install it.
 *
 * The okurigana readings are a bonus: when their files do not load, or the font
 * predates `salt`, the page is left as it is. So is the check for updates when
 * the site cannot say which release it serves.
 */
export async function toggleFurifont(options: FurifontOptions): Promise<void> {
  const { family, url, toast, okurigana, update } = options
  let state = window.furifont
  if (state?.family === family) {
    state.turn(state.sheet.disabled)
    if (!state.sheet.disabled)
      state.okurigana(okurigana)
    return
  }
  state ??= install(family)
  state.family = family
  state.restyle()
  state.turn(true)
  if (await loadFurifont(options)) {
    state.okurigana(okurigana)
    if (update)
      await showUpdates(options, update)
    return
  }
  state.turn(false)
  // So the next click tries again.
  state.family = ''
  showToast(toast.message, [downloadLink(url, toast)], toast.close)
}
