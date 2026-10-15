import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { formatPacked, packOkurigana, prunePairs, unpackOkurigana } from '../src/okurigana'

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

describe('prunePairs', () => {
  const shown = (run: string, reading: string): boolean => run === '来' && reading !== 'く'

  it('keeps the pairs that change what the font shows', () => {
    expect(prunePairs([['来ない', 'こ'], ['来ます', 'き']], shown)).toEqual([['来ない', 'こ'], ['来ます', 'き']])
  })

  it('drops readings the font cannot show, or shows anyway', () => {
    expect(prunePairs([['来る', 'く'], ['読ま', 'よ']], shown)).toEqual([])
  })

  it('keeps a pair that stops a shorter one, and drops one the shorter already reads', () => {
    expect(prunePairs([['来た', 'き'], ['来たる', 'く'], ['来たり', 'き'], ['来に', null], ['来にて', null]], shown)).toEqual([['来た', 'き'], ['来たる', null]])
  })
})

describe('the compiled pairs', async () => {
  const read = async (dir: string): Promise<Map<string, string | null>> => new Map(unpackOkurigana(JSON.parse(await readFile(new URL(`../${dir}/okurigana.json`, import.meta.url), 'utf8'))))
  const [raw, data] = await Promise.all([read('raw'), read('data')])

  it('start from what dict:update packs, and no other edit', async () => {
    expect(await readFile(new URL('../raw/okurigana.json', import.meta.url), 'utf8')).toBe(formatPacked(packOkurigana(raw)))
  })

  it('read a kanji with its okurigana as one word', () => {
    expect(data.get('来ない')).toBe('こ')
    expect(data.get('来ます')).toBe('き')
    expect(data.get('行い')).toBe('おこな')
    expect(data.get('下りた')).toBe('お')
    expect(data.get('美味し')).toBe('おい')
  })

  it('leave out the pairs a page gains nothing from', () => {
    // A lone 強 shows つよ without help, and 一人 ひとり; 行って reads two ways and stops no shorter pair.
    for (const key of ['強い', '一人も', '行って'])
      expect([raw.has(key), data.has(key)]).toEqual([true, false])
    expect(data.size).toBeLessThan(raw.size / 2)
  })
})
