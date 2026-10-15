import { createFontPlanner, glyphName, resolveOptions, toHiragana } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../../app/app/utils/samples'
import { loadDictionary } from '../src'

const planFont = createFontPlanner(await loadDictionary())
const options = resolveOptions()
const coverage = new Set([
  ...SAMPLES.flatMap(s => [...s.text]),
  ...Array.from({ length: 0x30FF - 0x3041 + 1 }, (_, i) => String.fromCharCode(0x3041 + i)),
].map(c => c.codePointAt(0)!))

interface Rule { glyphs: string[], lookups: string[] }

/** Block bodies by lookup name in a plan's feature code. */
function lookupsOf(fea: string): Map<string, string[]> {
  return new Map([...fea.matchAll(/lookup (\w+) useExtension \{\n([\s\S]*?)\n\} \1;/g)].map(m => [m[1]!, m[2]!.split('\n').map(l => l.trim())]))
}

/**
 * The reading a font built with the default options shows for `text`, in
 * hiragana, by applying the plan's rules the way a shaper does: at each
 * kanji, the first rule that matches, else the kanji's own lookup when it
 * stands alone, else nothing. A kanji without ruby stays as it is, which `matches` accepts for any reading.
 */
function readAs(text: string): string {
  const { plan } = planFont(options, coverage, text)
  const rubyOf = new Map(plan.glyphs.map(g => [g.name, g.ruby.map(r => r.text).join('')]))
  const lookups = lookupsOf(plan.fea)
  const substitutions = (name: string): Map<string, string> =>
    new Map((lookups.get(name) ?? []).map(l => l.match(/^sub (\S+) by (\S+);$/)).filter(m => !!m).map(m => [m[1]!, m[2]!]))
  const rules: Rule[] = (lookups.get('furigana') ?? [])
    .filter(l => /^(?:ignore )?sub \S+'/.test(l))
    .filter(l => !l.includes('@han') && !l.includes('['))
    .map(l => ({ glyphs: [...l.matchAll(/(\w+)'/g)].map(m => m[1]!), lookups: [...l.matchAll(/lookup (\w+)/g)].map(m => m[1]!) }))
  const isolated = substitutions('isolated')
  const chars = new Map([...text].map(c => [glyphName(c.codePointAt(0)!), c]))

  const readRun = (run: string[]): string => {
    let out = ''
    for (let i = 0; i < run.length;) {
      const rule = rules.find(r => r.glyphs.every((g, k) => run[i + k] === g))
      if (rule) {
        out += rule.glyphs.map((g, k) => {
          const to = rule.lookups[k] && substitutions(rule.lookups[k]).get(g)
          return (to && rubyOf.get(to)) || chars.get(g)
        }).join('')
        i += rule.glyphs.length
      }
      else {
        const to = run.length === 1 ? isolated.get(run[0]!) : undefined
        out += (to && rubyOf.get(to)) || chars.get(run[i]!)
        i++
      }
    }
    return out
  }

  return toHiragana(text.replace(/\p{Script=Han}+/gu, run => readRun([...run].map(c => glyphName(c.codePointAt(0)!)))))
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
