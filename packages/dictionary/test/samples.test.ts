import { createRubyReader } from '@furifont/compiler'
import { createFontPlanner, resolveOptions, toHiragana, WORD_SOURCES } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../../app/app/utils/samples'
import { formOf, readAllOverrides } from '../scripts/raw'
import { loadDictionary } from '../src'

/** Words the site itself sets in the font, where a wrong reading is on show. */
const INTERFACE_WORDS: { text: string, reading: string }[] = [
  { text: 'ローマ字', reading: 'ろーまじ' },
  { text: '明朝', reading: 'みんちょう' },
]

const overrides = Object.values(await readAllOverrides()).flat()
const planFont = createFontPlanner(await loadDictionary())
const options = resolveOptions()
/**
 * Words that only Tatoeba's sentences read whole: no list tags them, and
 * without them the font leaves a kanji bare or reads a place name. A lone 箱
 * is bare too, as ゴミ箱 ごみばこ is as common in the word lists.
 */
const EVERYDAY = [
  { text: '箱', reading: 'はこ' },
  { text: '傘', reading: 'かさ' },
  { text: '魚', reading: 'さかな' },
  { text: '留守中', reading: 'るすちゅう' },
  { text: '夕食後', reading: 'ゆうしょくご' },
  { text: '老婦人', reading: 'ろうふじん' },
  { text: '国中', reading: 'くにじゅう' },
]
const coverage = new Set([
  ...[...SAMPLES, ...EVERYDAY].flatMap(s => [...s.text]),
  ...overrides.flatMap(o => [...formOf(o)]),
  ...Array.from({ length: 0x30FF - 0x3041 + 1 }, (_, i) => String.fromCharCode(0x3041 + i)),
].map(c => c.codePointAt(0)!))

/** The reading a font built with the default options shows for `text`, in hiragana; a kanji without ruby stays as it is, which `matches` accepts for any reading. */
function readAs(text: string, planOptions = options): string {
  const chars = [...text]
  let shown = ''
  let at = 0
  for (const span of createRubyReader(planFont(planOptions, coverage, text).plan)(text)) {
    shown += chars.slice(at, span.start).join('') + span.ruby
    at = span.end
  }
  return toHiragana(shown + chars.slice(at).join(''))
}

/** Whether `shown` agrees with `reading`: each bare kanji stands for whatever reading it has. */
function matches(shown: string, reading: string): boolean {
  const pattern = [...shown].map(c => /\p{Script=Han}/u.test(c) ? '.+?' : c.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')).join('')
  return new RegExp(`^${pattern}$`, 'u').test(reading)
}

describe('sample texts', () => {
  it.each(SAMPLES)('shows no wrong reading in $text', ({ text, reading }) => {
    const shown = readAs(text)
    expect(matches(shown, reading), `${shown}\n${reading}`).toBe(true)
  })

  it.each(EVERYDAY)('reads the everyday word $text whole', ({ text, reading }) => {
    expect(readAs(text)).toBe(reading)
  })

  it('needs the example sentences for those words', () => {
    // A lone kanji's score has the sentences in it whatever the plan; a word's sources are the plan's to choose.
    const without = resolveOptions({ sources: WORD_SOURCES.filter(s => s !== 'tatoeba' && s !== 'jmdict') })
    for (const { text, reading } of EVERYDAY.filter(w => [...w.text].length > 1))
      expect(readAs(text, without)).not.toBe(reading)
  })

  it('leaves 人 bare, which reads ひと alone but にん after a number in digits', () => {
    expect(readAs('人')).toBe('人')
    expect(readAs('３人')).toBe('３人')
  })
})

describe('interface words', () => {
  it.each(INTERFACE_WORDS)('shows the right reading in $text', ({ text, reading }) => {
    const shown = readAs(text)
    expect(matches(shown, reading), `${shown}\n${reading}`).toBe(true)
  })
})
