import { createFontPlanner, resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { loadDictionary } from '../src'
import { OKURIGANA } from '../src/okurigana'

const dictionary = await loadDictionary()
const coverage = new Set(dictionary.entries.flatMap(e => [...e.form, ...e.furigana]).map(c => c.codePointAt(0)!))
const { report } = createFontPlanner(dictionary)(resolveOptions(), coverage)

describe('compiled dictionary', () => {
  it('records the sources it was compiled from', () => {
    expect(Object.keys(dictionary.sources)).toEqual(['JMdict', 'JMnedict', 'JmdictFurigana', 'KANJIDIC2'])
    expect(dictionary.entries.length).toBeGreaterThan(100_000)
  })

  it('defaults common words to the reading people use', () => {
    expect(report.ivs.words['今日']![0]).toBe('今日[きょう]')
    expect(report.ivs.words['明日']![0]).toBe('明日[あした]')
    expect(report.ivs.words['市場']![0]).toBe('市[いち]場[ば]')
    expect(report.ivs.words['出来']![0]).toBe('出[で]来[き]')
  })

  it('keeps the readings a conjugating kanji takes', () => {
    expect(dictionary.entries.find(e => e.form === '来る' && e.furigana === '0:く')?.conjugatesReading).toBe(true)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き', 'こ']))
  })

  it('reads stations as they are called and leaves ambiguous places out', () => {
    const place = (form: string): string | undefined => dictionary.places?.find(p => p.form === form)?.furigana
    expect(place('新宿')).toBe('0:しん;1:じゅく')
    expect(place('上野')).toBe('0:うえ;1:の')
    expect(place('神戸')).toBeUndefined()
    expect(report.stats.places).toBeGreaterThan(100_000)
  })

  it('keeps about ten thousand words and leaves ambiguous lone kanji out', () => {
    const words = report.stats.patterns - report.stats.places
    expect(words).toBeGreaterThan(8000)
    expect(words).toBeLessThan(15_000)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き']))
    expect(report.ivs.lone['桜']).toBe('さくら')
  })

  it('reads a kanji with its okurigana as one word', () => {
    expect(OKURIGANA.get('来ない')).toBe('こ')
    expect(OKURIGANA.get('来ます')).toBe('き')
    expect(OKURIGANA.get('行く')).toBe('い')
    expect(OKURIGANA.get('行い')).toBe('おこな')
    expect(OKURIGANA.get('下りた')).toBe('お')
    expect(OKURIGANA.get('強い')).toBe('つよ')
    expect(OKURIGANA.get('美味し')).toBe('おい')
  })

  it('marks pairs that read two ways, and stems that only repeat a shorter key', () => {
    expect(OKURIGANA.get('行って')).toBeNull()
    expect(OKURIGANA.get('開く')).toBeNull()
    expect(OKURIGANA.has('読まない')).toBe(false)
    expect(OKURIGANA.get('読ま')).toBe('よ')
  })
})
