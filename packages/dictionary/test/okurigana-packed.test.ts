import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { OKURIGANA } from '../src/okurigana'
import { formatPacked, packOkurigana, unpackOkurigana } from '../src/pack.ts'

describe('packOkurigana', () => {
  it('groups okurigana by run of kanji and reading, with ambiguous ones under the empty reading', () => {
    expect(packOkurigana([['来ない', 'こ'], ['来なかった', 'こ'], ['来ます', 'き'], ['来に', null], ['一人も', 'ひとり'], ['一人前になら', 'いちにんまえ']])).toEqual({
      一人: { ひとり: ['も'] },
      一人前: { いちにんまえ: ['になら'] },
      来: { '': ['に'], 'き': ['ます'], 'こ': ['ない', 'なかった'] },
    })
  })

  it('loses nothing', () => {
    const pairs: [string, string | null][] = [['来ない', 'こ'], ['来に', null], ['一人も', 'ひとり'], ['亜リャンメン', 'あ']]
    expect(new Map(unpackOkurigana(packOkurigana(pairs)))).toEqual(new Map(pairs))
  })

  it('writes a run a line', () => {
    expect(formatPacked({ 来: { く: ['る'] }, 一人: { ひとり: ['も'] } })).toBe('{\n"来":{"く":["る"]},\n"一人":{"ひとり":["も"]}\n}\n')
  })
})

describe('data/okurigana.json', () => {
  it('is what dict:update packs from its pairs, and no other edit', async () => {
    const file = await readFile(new URL('../data/okurigana.json', import.meta.url), 'utf8')
    expect(file).toBe(formatPacked(packOkurigana(OKURIGANA)))
  })

  it('holds the pairs of whole runs, as pages read them', () => {
    expect(OKURIGANA.get('一人も')).toBe('ひとり')
    expect(OKURIGANA.get('一人前になら')).toBe('いちにんまえ')
    expect([...OKURIGANA.keys()].filter(key => /^\p{sc=Han}{2}/u.test(key)).length).toBeGreaterThan(5000)
  })
})
