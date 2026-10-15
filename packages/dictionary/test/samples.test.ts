import { createRubyReader } from '@furifont/compiler'
import { createFontPlanner, resolveOptions, toHiragana } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../../app/app/utils/samples'
import { loadDictionary } from '../src'

const planFont = createFontPlanner(await loadDictionary())
const options = resolveOptions()
const coverage = new Set([
  ...SAMPLES.flatMap(s => [...s.text]),
  ...Array.from({ length: 0x30FF - 0x3041 + 1 }, (_, i) => String.fromCharCode(0x3041 + i)),
].map(c => c.codePointAt(0)!))

/** The reading a font built with the default options shows for `text`, in hiragana; a kanji without ruby stays as it is, which `matches` accepts for any reading. */
function readAs(text: string): string {
  const chars = [...text]
  let shown = ''
  let at = 0
  for (const span of createRubyReader(planFont(options, coverage, text).plan)(text)) {
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
})
