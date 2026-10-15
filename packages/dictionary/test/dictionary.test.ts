import { createFontPlanner, MANUAL_SOURCES, resolveOptions } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { loadDictionary } from '../src'

const dictionary = await loadDictionary()
const coverage = new Set([dictionary.runs, dictionary.kanji].flatMap(table => Object.entries(table).flatMap(([text, readings]) => [...text, ...Object.keys(readings).join('')])).map(c => c.codePointAt(0)!))
const planFont = createFontPlanner(dictionary)
const { report } = planFont(resolveOptions(), coverage)

describe('compiled dictionary', () => {
  it('records the sources it was compiled from', () => {
    expect(Object.keys(dictionary.versions)).toEqual(['JMdict', 'JMnedict', 'JmdictFurigana', 'KANJIDIC2', 'JLPT', 'Tatoeba'])
    expect(Object.keys(dictionary.runs).length).toBeGreaterThan(200_000)
  })

  it('merges what every source says of a reading', () => {
    expect(dictionary.runs['日本']?.['0-1:にほん']).toMatchObject({ 'jmdict': 0, 'nf': 25, 'spec1': true, 'jlpt': 3, 'jr-stations': true })
    expect(dictionary.runs['明朝']?.['0:みん;1:ちょう']).toMatchObject({ jmdict: 0, default: true })
  })

  it('leaves out what no plan reads', () => {
    // A lone kanji of a word no list tags weighs nothing but before okurigana, which 梔 くちなし has none of.
    expect(dictionary.kanji['梔']).toBeUndefined()
    expect(dictionary.kanji['奉']?.['たてまつ']).toEqual({ inflecting: true })
  })

  it('defaults common words to the reading people use', () => {
    expect(report.ivs.words['今日']![0]).toBe('今日[きょう]')
    expect(report.ivs.words['明日']![0]).toBe('明日[あした]')
    expect(report.ivs.words['市場']![0]).toBe('市[いち]場[ば]')
    expect(report.ivs.words['出来']![0]).toBe('出[で]来[き]')
  })

  it('keeps the readings a conjugating kanji takes', () => {
    expect(Object.keys(dictionary.kanji['来']!)).toEqual(expect.arrayContaining(['く', 'き', 'こ']))
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き', 'こ']))
  })

  it('reads stations as they are called and leaves ambiguous places out', () => {
    const place = (form: string): string | undefined => Object.entries(dictionary.runs[form] ?? {}).find(([, sources]) => sources.place)?.[0]
    expect(place('新宿')).toBe('0:しん;1:じゅく')
    expect(place('上野')).toBe('0:うえ;1:の')
    expect(place('神戸')).toBeUndefined()
    expect(report.stats.places).toBeGreaterThan(100_000)
  })

  it('aligns readings that JMdict writes with a long vowel mark', () => {
    expect(Object.keys(dictionary.runs['麻雀']!)).toEqual(['0:まー;1:じゃん'])
  })

  it('adds the words no list ranks, unless the plan turns them off', () => {
    expect(dictionary.runs['四字熟語']).toEqual({ '0:よ;1:じ;2:じゅく;3:ご': { jmdict: 0 } })
    const without = planFont(resolveOptions({ untagged: false }), coverage).report
    expect(report.stats.patterns - without.stats.patterns).toBeGreaterThan(10_000)
  })

  it('lists the words of every manual source', () => {
    const listed = new Set(Object.values(dictionary.runs).flatMap(readings => Object.values(readings).flatMap(sources => MANUAL_SOURCES.filter(name => sources[name]))))
    expect([...listed].sort()).toEqual([...MANUAL_SOURCES].sort())
  })

  it('adds the mahjong yaku, unless the plan leaves the source out', () => {
    expect(dictionary.runs['立直']?.['0:りー;1:ち']).toEqual({ 'mahjong-yaku': true })
    const without = planFont(resolveOptions({ manual: [] }), coverage).report
    expect(report.stats.patterns - without.stats.patterns).toBeGreaterThan(30)
    expect(report.stats.places - without.stats.places).toBe(report.stats.patterns - without.stats.patterns)
  })

  it('adds the JR stations the places leave unread', () => {
    expect(dictionary.runs['阿蘇']?.['0-1:あそ']).toEqual({ 'jr-stations': true })
    const without = planFont(resolveOptions({ manual: ['mahjong-yaku'] }), coverage).report
    expect(report.stats.patterns - without.stats.patterns).toBeGreaterThan(0)
  })

  it('adds four-character idioms, unless the plan leaves the source out', () => {
    expect(dictionary.runs['阿鼻叫喚']?.['0-3:あびきょうかん']).toEqual({ yojijukugo: true })
    const without = planFont(resolveOptions({ manual: ['mahjong-yaku', 'jr-stations'] }), coverage).report
    expect(report.stats.patterns - without.stats.patterns).toBeGreaterThan(0)
  })

  it('keeps about nineteen thousand words and leaves ambiguous lone kanji out', () => {
    const words = report.stats.patterns - report.stats.places
    expect(words).toBeGreaterThan(15_000)
    expect(words).toBeLessThan(23_000)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き']))
    expect(report.ivs.lone['桜']).toBe('さくら')
  })

  it('knows the JLPT level of words as the lists write them', () => {
    expect(dictionary.runs['今日']?.['0-1:きょう']?.jlpt).toBe(5)
    expect(dictionary.kanji['会']?.['あ']?.jlpt).toBe(5)
    const known = planFont(resolveOptions({ skipJlpt: 'N5' }), coverage).report
    expect(known.ivs.words['今日']).toBeUndefined()
    expect(known.ivs.lone['私']).toBeUndefined()
    expect(report.ivs.lone['私']).toBe('わたし')
  })

  it('counts the uses of each reading in the example sentences, as the font sees them', () => {
    const uses = (form: string, furigana: string): number | undefined => dictionary.runs[form]?.[furigana]?.tatoeba
    expect(uses('今日', '0-1:きょう')).toBeGreaterThan(uses('今日', '0:こん;1:にち') ?? 0)
    expect(uses('資金不足', '0:し;1:きん;2:ぶ;3:そく')).toBeGreaterThanOrEqual(3)
    // The sentences use 為る thousands of times, always written する.
    expect(dictionary.kanji['為']?.['す']).toEqual({ inflecting: true })
  })
})
