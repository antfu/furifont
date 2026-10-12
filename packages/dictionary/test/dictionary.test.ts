import { createFontPlanner, resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { loadDictionary } from '../src'

const dictionary = await loadDictionary()
const coverage = new Set(dictionary.entries.flatMap(e => [...e.form, ...e.furigana]).map(c => c.codePointAt(0)!))
const { report } = createFontPlanner(dictionary)(resolveOptions(), coverage)

describe('compiled dictionary', () => {
  it('records the sources it was compiled from', () => {
    expect(Object.keys(dictionary.sources)).toEqual(['JMdict', 'JmdictFurigana', 'KANJIDIC2'])
    expect(dictionary.entries.length).toBeGreaterThan(100_000)
  })

  it('defaults common words to the reading people use', () => {
    expect(report.ivs.words['今日']![0]).toBe('今日[きょう]')
    expect(report.ivs.words['明日']![0]).toBe('明日[あした]')
    expect(report.ivs.words['市場']![0]).toBe('市[いち]場[ば]')
  })

  it('keeps a few thousand words and leaves ambiguous lone kanji out', () => {
    expect(report.stats.patterns).toBeGreaterThan(3000)
    expect(report.stats.patterns).toBeLessThan(10_000)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き']))
    expect(report.ivs.kanji['桜']).toEqual(['さくら'])
  })
})
