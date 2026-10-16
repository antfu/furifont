import type { Reading, WordSource } from '@furifont/core'
import { createFontPlanner, MANUAL_SOURCES, resolveOptions, SCORE, sourcesIn, WORD_SOURCES } from '@furifont/core'
import { describe, expect, it } from 'vitest'
import { loadDictionary } from '../src'

const dictionary = await loadDictionary()
const coverage = new Set([dictionary.runs, dictionary.kanji].flatMap(table => Object.entries(table).flatMap(([text, readings]) => [...text, ...Object.keys(readings).join('')])).map(c => c.codePointAt(0)!))
const planFont = createFontPlanner(dictionary)
const { report } = planFont(resolveOptions(), coverage)
const without = (...names: WordSource[]) => planFont(resolveOptions({ sources: WORD_SOURCES.filter(s => !names.includes(s)) }), coverage).report
const sourcesOf = (reading: Reading | undefined) => reading && sourcesIn(reading[1])

describe('compiled dictionary', () => {
  it('records the sources it was compiled from', () => {
    expect(Object.keys(dictionary.versions)).toEqual(['JMdict', 'JMnedict', 'JmdictFurigana', 'KANJIDIC2', 'JLPT', 'Tatoeba'])
    expect(Object.keys(dictionary.runs).length).toBeGreaterThan(200_000)
  })

  it('scores a reading by its most telling source and merges every source of it', () => {
    // A dropped compound may lift it to its own score, as 日本 is lifted from 61.
    expect(dictionary.runs['日本']?.['0-1:にほん']?.[0]).toBeGreaterThanOrEqual(61)
    expect(sourcesOf(dictionary.runs['日本']?.['0-1:にほん'])).toEqual(['jmdict', 'news', 'spec', 'nf', 'tatoeba', 'jr-stations', 'N3'])
    expect(sourcesOf(dictionary.runs['明朝']?.['0:みん;1:ちょう'])).toEqual(['jmdict', 'default'])
  })

  it('merges readings of the same kana under the alignment that splits them most', () => {
    expect(Object.keys(dictionary.runs['倉本']!)).toEqual(['0:くら;1:もと'])
    expect(sourcesOf(dictionary.runs['倉本']!['0:くら;1:もと'])).toEqual(['jmdict', 'place', 'jr-stations', 'japan-post'])
  })

  it('ranks the readings of a run, the default first', () => {
    expect(Object.keys(dictionary.runs['今日']!)[0]).toBe('0-1:きょう')
    // The sentences' くにじゅう before JMnedict's くになか.
    expect(Object.keys(dictionary.runs['国中']!).slice(0, 2)).toEqual(['0:くに;1:じゅう', '0:くに;1:なか'])
  })

  it('leaves out what no plan reads', () => {
    // A lone kanji of a word no list tags weighs nothing but before okurigana, which 梔 くちなし has none of.
    expect(dictionary.kanji['梔']).toBeUndefined()
    expect(sourcesOf(dictionary.kanji['奉']?.['たてまつ'])).toEqual(['jmdict', 'inflecting'])
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
    const place = (form: string): string | undefined => Object.entries(dictionary.runs[form] ?? {}).find(([, reading]) => sourcesOf(reading)!.includes('place'))?.[0]
    expect(place('新宿')).toBe('0:しん;1:じゅく')
    expect(place('上野')).toBe('0:うえ;1:の')
    expect(place('神戸')).toBeUndefined()
    expect(report.stats.places).toBeGreaterThan(100_000)
  })

  it('aligns readings that JMdict writes with a long vowel mark', () => {
    expect(Object.keys(dictionary.runs['麻雀']!)).toEqual(['0:まー;1:じゃん'])
  })

  it('adds the words no list ranks, unless the plan leaves JMdict out', () => {
    expect(dictionary.runs['四字熟語']).toEqual({ '0:よ;1:じ;2:じゅく;3:ご': [SCORE.listed, 1] })
    expect(report.stats.patterns - without('jmdict').stats.patterns).toBeGreaterThan(10_000)
  })

  it('lists the words of every manual source', () => {
    const listed = new Set(Object.values(dictionary.runs).flatMap(readings => Object.values(readings).flatMap(reading => sourcesOf(reading)!.filter(name => (MANUAL_SOURCES as readonly string[]).includes(name)))))
    expect([...listed].sort()).toEqual([...MANUAL_SOURCES].sort())
  })

  it('adds the words of each manual list, unless the plan leaves it out', () => {
    expect(sourcesOf(dictionary.runs['立直']?.['0:りー;1:ち'])).toEqual(['mahjong-yaku'])
    expect(sourcesOf(dictionary.runs['阿蘇']?.['0:あ;1:そ'])).toEqual(['place', 'jr-stations'])
    expect(sourcesOf(dictionary.runs['一期一会']?.['0:いち;1:ご;2:いち;3:え'])).toEqual(['jmdict', 'yojijukugo'])
    // Names several places share keep the reading most of them use: 一宮 is いっく only in Kochi.
    expect(sourcesOf(dictionary.runs['一宮']?.['0-1:いちのみや'])).toEqual(['japan-post'])
    expect(sourcesOf(dictionary.runs['四宮']?.['0-1:しのみや'])).toEqual(['japan-post'])
    for (const name of MANUAL_SOURCES) {
      const lacking = without(name)
      expect(report.stats.patterns - lacking.stats.patterns, name).toBeGreaterThan(0)
      expect(report.stats.places - lacking.stats.places, name).toBe(report.stats.patterns - lacking.stats.patterns)
    }
  })

  it('takes the most common words first and leaves ambiguous lone kanji out', () => {
    const taken = planFont(resolveOptions({ take: 20_000 }), coverage).report
    expect(taken.stats.patterns).toBe(20_000)
    expect(taken.ivs.words['今日']![0]).toBe('今日[きょう]')
    expect(taken.stats.places).toBeLessThan(2_000)
    expect(report.ivs.kanji['来']).toEqual(expect.arrayContaining(['く', 'き']))
    expect(report.ivs.lone['桜']).toBe('さくら')
  })

  it('skips the most common words, and lone kanji, whole', () => {
    const skipped = planFont(resolveOptions({ skip: 2_000 }), coverage).report
    expect(skipped.ivs.words['今日']).toBeUndefined()
    expect(skipped.ivs.lone['桜']).toBeUndefined()
    expect(report.stats.patterns - skipped.stats.patterns).toBeGreaterThan(1_000)
  })

  it('knows the JLPT level of words as the lists write them', () => {
    expect(sourcesOf(dictionary.runs['今日']?.['0-1:きょう'])).toContain('N5')
    expect(sourcesOf(dictionary.kanji['会']?.['あ'])).toContain('N5')
    const known = planFont(resolveOptions({ skipJlpt: 'N5' }), coverage).report
    expect(known.ivs.words['今日']).toBeUndefined()
    expect(known.ivs.lone['私']).toBeUndefined()
    expect(report.ivs.lone['私']).toBe('わたし')
  })

  it('scores the words the example sentences use, as the font sees them', () => {
    expect(sourcesOf(dictionary.runs['資金不足']?.['0:し;1:きん;2:ぶ;3:そく'])).toContain('tatoeba')
    expect(dictionary.runs['資金不足']!['0:し;1:きん;2:ぶ;3:そく']![0]).toBeGreaterThan(SCORE.used)
    // The sentences use 為る thousands of times, always written する.
    expect(sourcesOf(dictionary.kanji['為']?.['す'])).toEqual(['jmdict', 'inflecting'])
  })
})
