import type { PlanReport } from '@furifont/core'
import { isHan, parseNotation, SELECTOR_FIRST_READING, SELECTOR_SUPPRESS, toHiragana } from '@furifont/core'

/** The reading lists a font's selectors index into, as in its `.ivs.json`. */
export type ReadingReference = PlanReport['ivs']

/** What a morphological analyzer gives per word, as kuromoji's IPADIC tokenizer does. */
export interface Token {
  surface_form: string
  pos: string
  reading?: string
}

export interface Tokenizer {
  tokenize: (text: string) => Token[]
}

/** Words whose reading the kana after them decides: kana a font never sees. */
const INFLECTING = new Set(['動詞', '形容詞'])
const SELECTORS = /[\u{E01E0}-\u{E01EF}]/gu

const selector = (index: number): string => String.fromCodePoint(SELECTOR_FIRST_READING + index)

/** 書い read かい: the kana outside the kanji pin down the kanji's part, here か. */
function readRuns(surface: string, reading: string): { text: string, reading?: string }[] | undefined {
  const parts = surface.match(/\p{Script=Han}+|\P{Script=Han}+/gu) ?? []
  const pattern = parts.map(p => isHan(p[0]!) ? '(.+?)' : toHiragana(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
  const match = new RegExp(`^${pattern}$`, 'u').exec(reading)
  if (!match)
    return
  let group = 1
  return parts.map(p => isHan(p[0]!) ? { text: p, reading: match[group++] } : { text: p })
}

function annotateRun(run: string, reading: string, reference: ReadingReference): string {
  const chars = [...run]
  if (chars.length === 1) {
    const index = reference.kanji[run]?.indexOf(reading) ?? -1
    // A reading the font cannot draw: bare beats a wrong default.
    return run + (index >= 0 ? selector(index) : String.fromCodePoint(SELECTOR_SUPPRESS))
  }
  const index = reference.words[run]?.findIndex(n => parseNotation(n).spans.map(s => s.ruby).join('') === reading) ?? -1
  return index > 0 ? chars[0] + selector(index) + chars.slice(1).join('') : run
}

/**
 * Writes, after each kanji of a verb or adjective, the variation selector that
 * makes the font show the reading the analyzer found: 来ない gets こ, 来ます き.
 * The text is otherwise unchanged; selectors already in it are replaced.
 */
export function createAnnotator(tokenizer: Tokenizer, reference: ReadingReference): (text: string) => string {
  return text => tokenizer.tokenize(text.replace(SELECTORS, '')).map((token) => {
    if (!INFLECTING.has(token.pos) || !token.reading || token.reading === '*')
      return token.surface_form
    const runs = readRuns(token.surface_form, toHiragana(token.reading))
    return runs?.map(r => r.reading ? annotateRun(r.text, r.reading, reference) : r.text).join('') ?? token.surface_form
  }).join('')
}
