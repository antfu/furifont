import type { RubySpan } from './dictionary'
import type { Dictionary, Reading } from './schema'
import type { Suffixes } from './suffixes'
import { getOrCreate, parseFurigana } from './dictionary'
import { JLPT_LEVELS, sourceBit } from './schema'
import { pickSuffixes } from './suffixes'

interface Known {
  /** The default reading's key in the dictionary. */
  key: string
  /** What the default reading writes over the run, in hiragana. */
  kana: string
  score: number
  sources: number
}

const maskOf = (sources: readonly Parameters<typeof sourceBit>[0][]): number => sources.reduce((mask, source) => mask | sourceBit(source), 0)

const PIN = sourceBit('default')
const JMDICT = sourceBit('jmdict')
/** What marks a word as common, which the parts of a dropped run take over. */
const TAG_MASK = maskOf(['ichi', 'news', 'spec', 'gai', 'nf', 'tatoeba'])
/** What a plan reads a word by besides its sources, so that a word with any of these stays: the JLPT levels a reader skips, the curated default. */
const KEEP_MASK = maskOf([...JLPT_LEVELS, 'default'])

/** `parseFurigana` of the readings each pass looks at again. */
const spansCache = new Map<string, RubySpan[]>()
function spansOf(key: string): RubySpan[] {
  let spans = spansCache.get(key)
  if (!spans)
    spansCache.set(key, spans = parseFurigana(key))
  return spans
}

function knownOf(dictionary: Dictionary, text: string): { known: Known, droppable: boolean } {
  const entries = Object.entries(dictionary.runs[text]!) as [string, Reading][]
  // The reading a plan defaults to: the curated pin, else the dictionary's first.
  const [key, [score, sources]] = entries.find(([, [, sources]]) => sources & PIN) ?? entries[0]!
  return {
    known: { key, kana: spansOf(key).map(s => s.ruby).join(''), score, sources },
    // A run with another reading, a JLPT level or a curated default may be read differently by a plan.
    droppable: entries.length === 1 && !(sources & KEEP_MASK) && !dictionary.bare.includes(text),
  }
}

/** The suffix reading of the kanji at `p` of a run when no word claimed it, as the font applies it. */
function suffixAt(chars: string[], p: number, suffixes: Suffixes): string | undefined {
  const kanji = chars[p]!
  return p > 0 && (p === chars.length - 1 || !suffixes.final.has(kanji)) ? suffixes.readings.get(kanji) : undefined
}

interface Parts {
  words: { text: string, part: Known }[]
  /** The kanji no word claimed, which a suffix reading covers. */
  suffixes: string[]
}

/** The words of `known`, and the suffixes, that the longest-match rules choose over `text`, when together they write `run`'s reading. */
function partsOf(text: string, run: Known, known: Map<string, Known>, suffixes: Suffixes): Parts | undefined {
  const chars = [...text]
  const parts: Parts = { words: [], suffixes: [] }
  let kana = ''
  for (let p = 0; p < chars.length;) {
    // A part is never as long as the run itself.
    let size = p === 0 ? chars.length - 1 : chars.length - p
    for (; size >= 2; size--) {
      const word = chars.slice(p, p + size).join('')
      const part = known.get(word)
      if (part) {
        parts.words.push({ text: word, part })
        kana += part.kana
        break
      }
    }
    if (size < 2) {
      // No word here: a suffix reads the kanji after another, or it stays bare.
      const suffix = suffixAt(chars, p, suffixes)
      if (suffix === undefined)
        return undefined
      parts.suffixes.push(chars[p]!)
      kana += suffix
      size = 1
    }
    p += size
  }
  return kana === run.kana ? parts : undefined
}

function prunePass(dictionary: Dictionary, suffixes: Suffixes): { dictionary: Dictionary, pruned: Map<string, string[]> } {
  const byLength = new Map<number, string[]>()
  for (const text of Object.keys(dictionary.runs)) {
    const length = [...text].length
    getOrCreate(byLength, length, () => []).push(text)
  }
  const known = new Map<string, Known>()
  /** The runs dropped, with the suffixes each one counts on. */
  const pruned = new Map<string, string[]>()
  /** What each part gains: the best score of the runs it stands in for, and their tags. */
  const gains = new Map<string, Reading>()
  for (const length of [...byLength.keys()].sort((a, b) => a - b)) {
    const kept: [string, Known][] = []
    for (const text of byLength.get(length)!) {
      const { known: run, droppable } = knownOf(dictionary, text)
      const parts = droppable ? partsOf(text, run, known, suffixes) : undefined
      if (!parts) {
        kept.push([text, run])
        continue
      }
      pruned.set(text, parts.suffixes)
      for (const { text: partText } of parts.words) {
        const [score, tags] = gains.get(partText) ?? [0, 0]
        gains.set(partText, [Math.max(score, run.score), tags | (run.sources & TAG_MASK)])
      }
    }
    for (const [text, run] of kept)
      known.set(text, run)
  }
  const runs = Object.fromEntries(Object.entries(dictionary.runs).filter(([text]) => !pruned.has(text)).map(([text, readings]): [string, Record<string, Reading>] => {
    const gain = gains.get(text)
    const key = known.get(text)?.key
    return [text, gain ? Object.fromEntries(Object.entries(readings).map(([k, [score, sources]]): [string, Reading] => k === key ? [k, [Math.max(score, gain[0]), sources | gain[1]]] : [k, [score, sources]])) : readings]
  }))
  return { dictionary: { ...dictionary, runs }, pruned }
}

/** The suffixes of the dictionary's JMdict words, as the planner picks them. */
function suffixesOf(dictionary: Dictionary): Suffixes {
  return pickSuffixes(Object.entries(dictionary.runs).flatMap(([text, readings]): [string, RubySpan[][]][] => {
    const jmdict = Object.entries(readings).filter(([, [, sources]]) => sources & JMDICT).map(([key]) => spansOf(key))
    return jmdict.length ? [[text, jmdict]] : []
  }))
}

/**
 * Drops the runs the font reads right without them: a run of one reading that
 * the longest-match rules split into other words, which together write the
 * run's reading, as 公認会計士 is 公認 and 会計士. Such a run only adds rules.
 *
 * The runs are judged shortest first, each against the words kept, as the
 * font would choose them, so that a dropped run never takes away a part
 * another run needs. A run stays when any plan could read it differently:
 * with another reading, a JLPT level or a curated default.
 *
 * The parts take over what made the run common: its score, so that any `take`
 * or `skip` that reaches the run reaches them, and its tags. A plan that
 * narrows `sources` to where the run comes from but not the parts (a place
 * name of `place`, whose parts are JMdict's words) reads the parts alone.
 */
export function pruneRuns(dictionary: Dictionary): { dictionary: Dictionary, pruned: string[] } {
  // Dropping words changes which kanji read one way ending the runs: a suffix that no longer holds is not counted on again.
  const banned = new Set<string>()
  const usable = (suffixes: Suffixes): Suffixes => ({ readings: new Map([...suffixes.readings].filter(([k]) => !banned.has(k))), final: suffixes.final })
  let suffixes = usable(suffixesOf(dictionary))
  let result = prunePass(dictionary, suffixes)
  for (let pass = 0; pass < 20; pass++) {
    const next = suffixesOf(result.dictionary)
    const holds = (kanji: string): boolean => next.readings.get(kanji) === suffixes.readings.get(kanji) && next.final.has(kanji) === suffixes.final.has(kanji)
    const stale = new Set([...result.pruned.values()].flat().filter(kanji => !holds(kanji)))
    if (!stale.size)
      break
    for (const kanji of stale)
      banned.add(kanji)
    suffixes = usable(next)
    result = prunePass(dictionary, suffixes)
  }
  return { dictionary: result.dictionary, pruned: [...result.pruned.keys()] }
}
