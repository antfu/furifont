import { resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { SAMPLES } from '../../app/app/utils/samples'
import { loadDictionary } from '../src'

const dictionary = await loadDictionary()
const { nfMax, selectTags } = resolveOptions()
const words = new Set([
  ...dictionary.entries.filter(e => (e.nf > 0 && e.nf <= nfMax) || selectTags.some(t => e.priority.split(' ').includes(t))).map(e => e.form),
  ...dictionary.places!.map(p => p.form),
])

/** Whether a run of kanji splits wholly into default words of two kanji or more. */
function covered(run: string[]): boolean {
  const reach = [true, ...run.map(() => false)]
  for (let end = 2; end <= run.length; end++)
    reach[end] = Array.from({ length: end - 1 }, (_, start) => start).some(start => reach[start] && words.has(run.slice(start, end).join('')))
  return reach[run.length]!
}

describe('sample texts', () => {
  const runs = [...new Set(SAMPLES.flatMap(s => s.text.match(/\p{Script=Han}{2,}/gu) ?? []))]

  it.each(runs)('reads %s from the default words', (run) => {
    expect(covered([...run])).toBe(true)
  })
})
