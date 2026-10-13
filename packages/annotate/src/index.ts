import type { PlanReport } from '@furifont/core'
import { parseNotation, SELECTOR_FIRST_READING, SELECTOR_SUPPRESS } from '@furifont/core'

/** The reading lists a font's selectors index into, as in its `.ivs.json`. */
export type ReadingReference = PlanReport['ivs']

/** A kanji run with the kana after it, read as one; null where the pair reads two ways. As `@furifont/dictionary/okurigana`. */
export type OkuriganaPairs = ReadonlyMap<string, string | null>

const SELECTORS = /[\u{E01E0}-\u{E01EF}]/gu
const HAN_RUN = /\p{Script=Han}+/gu
const TRAILING_KANA = /\P{Script=Han}+$/u
const SUPPRESS = String.fromCodePoint(SELECTOR_SUPPRESS)

const selector = (index: number): string => String.fromCodePoint(SELECTOR_FIRST_READING + index)

/**
 * The selector that makes the font show `reading` on `run`, empty where it
 * already does. A run read two ways (null), or one way the font cannot draw,
 * gets VS225 where the font would otherwise show ruby: bare beats wrong.
 */
function selectorFor(run: string, reading: string | null, reference: ReadingReference): string {
  if ([...run].length === 1) {
    const shown = reference.lone[run]
    const index = reading === null ? -1 : reference.kanji[run]?.indexOf(reading) ?? -1
    if (reading === shown)
      return ''
    return index >= 0 ? selector(index) : shown ? SUPPRESS : ''
  }
  const words = reference.words[run]
  if (!words)
    return ''
  const index = reading === null ? -1 : words.findIndex(n => parseNotation(n).spans.map(s => s.ruby).join('') === reading)
  return index > 0 ? selector(index) : index === 0 ? '' : SUPPRESS
}

/**
 * Writes, after the first kanji of each word whose okurigana decides its
 * reading, the variation selector that makes the font show it: 来ない gets こ,
 * 来ます き. The font never sees the kana after a kanji, so this runs on the
 * text instead. The text is otherwise unchanged; selectors already in it are
 * replaced.
 */
export function createAnnotator(pairs: OkuriganaPairs, reference: ReadingReference): (text: string) => string {
  let longest = 0
  for (const key of pairs.keys())
    longest = Math.max(longest, key.length - key.replace(TRAILING_KANA, '').length)
  return (input) => {
    const text = input.replace(SELECTORS, '')
    return text.replace(HAN_RUN, (run: string, offset: number) => {
      const after = text.slice(offset + run.length, offset + run.length + longest)
      for (let length = after.length; length > 0; length--) {
        const reading = pairs.get(run + after.slice(0, length))
        if (reading !== undefined) {
          const [first, ...rest] = run
          return first + selectorFor(run, reading, reference) + rest.join('')
        }
      }
      return run
    })
  }
}
