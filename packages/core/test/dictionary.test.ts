import type { Source } from '../src'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { DictionarySchema, formatDictionary, formatNotation, fuseDictionary, hanRuns, parseFurigana, parseNotation, pruneRuns, sourceBit } from '../src'
import { dictionary, sources } from './fixture'

describe('dictionary', () => {
  it('splits a word into the Han runs a shaper sees', () => {
    expect(hanRuns('落ち着く', parseFurigana('0:お;2:つ'))).toEqual([
      { text: '落', spans: [{ start: 0, end: 1, ruby: 'お' }] },
      { text: '着', spans: [{ start: 0, end: 1, ruby: 'つ' }] },
    ])
    expect(hanRuns('今日中', parseFurigana('0-1:きょう;2:じゅう')).map(r => r.spans.length)).toEqual([2])
  })

  it('drops runs whose kanji are not all annotated', () => {
    expect(hanRuns('一ヶ月', parseFurigana('0:いっ;1:か;2:げつ')).map(r => r.text)).toEqual(['一', '月'])
    expect(hanRuns('日本', parseFurigana('0:に'))).toEqual([])
  })

  it('round-trips the inline notation', () => {
    for (const notation of ['日[に]本[ほん]', '今日[きょう]', '食[た]べ物[もの]', 'お茶[ちゃ]']) {
      const { form, spans } = parseNotation(notation)
      expect(formatNotation(form, spans)).toBe(notation)
    }
    expect(() => parseNotation('にほん')).toThrow(/no reading/)
    expect(() => parseNotation('に[ほん]')).toThrow(/does not follow a kanji/)
  })
})

describe('fuseDictionary', () => {
  const mask = (...names: Source[]): number => names.reduce((m, name) => m | sourceBit(name), 0)

  it('scores each reading of a run by its most telling source, and merges its sources', () => {
    const fused = fuseDictionary({ ...sources, defaults: ['今[こん]日[にち]'] })
    expect(fused.runs['今日']).toEqual({
      '0-1:きょう': [92, mask('jmdict', 'ichi', 'nf')],
      '0:こん;1:にち': [92, mask('jmdict', 'ichi', 'news', 'nf', 'default')],
      '0:こん;1:じつ': [5, mask('jmdict')],
    })
    expect(fused.runs['東京']).toEqual({ '0:とう;1:きょう': [61, mask('jmdict', 'news', 'spec', 'nf')] })
  })

  it('merges readings of the same kana under the alignment that splits them most', () => {
    const fused = fuseDictionary({ ...sources, places: [{ form: '日本', furigana: '0-1:にほん' }] })
    expect(fused.runs['日本']).toEqual({ '0:に;1:ほん': [100, mask('jmdict', 'ichi', 'news', 'nf', 'place')] })
  })

  it('ranks a place name above a word no list tags, and below one the sentences use', () => {
    const places = [{ form: '大人気', furigana: '0:おお;1:ひと;2:け' }]
    expect(Object.keys(fuseDictionary({ ...sources, places }).runs['大人気']!)).toEqual(['0:おお;1:ひと;2:け', '0:だい;1:にん;2:き'])
    const entries = sources.entries.map(e => e.form === '大人気' ? { ...e, tatoeba: 4 } : e)
    expect(fuseDictionary({ ...sources, entries, places }).runs['大人気']).toEqual({
      '0:だい;1:にん;2:き': [24, mask('jmdict', 'tatoeba')],
      '0:おお;1:ひと;2:け': [10, mask('place')],
    })
  })

  it('scores a run past four kanji lower the longer it is, within its tier', () => {
    const entry = (form: string, furigana: string, nf: number) => ({ form, furigana, nf, priority: 'nf', order: 0 })
    const fused = fuseDictionary({ ...sources, places: [], entries: [
      entry('社会保険', '0:しゃ;1:かい;2:ほ;3:けん', 1),
      entry('社会保険庁', '0:しゃ;1:かい;2:ほ;3:けん;4:ちょう', 1),
      entry('社会保険診療報酬', '0:しゃ;1:かい;2:ほ;3:けん;4:しん;5:りょう;6:ほう;7:しゅう', 1),
      entry('社会保険診療報酬支払基金', '0:しゃ;1:かい;2:ほ;3:けん;4:しん;5:りょう;6:ほう;7:しゅう;8:し;9:はらい;10:き;11:きん', 1),
    ] })
    const [four, five, eight, twelve] = ['社会保険', '社会保険庁', '社会保険診療報酬', '社会保険診療報酬支払基金'].map(t => Object.values(fused.runs[t]!)[0]![0])
    expect([four! - five!, four! - eight!]).toEqual([2, 8])
    expect(twelve).toBeGreaterThan(50)
  })

  it('reads a lone kanji by its tagged words, or by an untagged one before okurigana', () => {
    expect(Object.keys(dictionary.kanji['来']!)).toEqual(['く', 'き', 'こ'])
    expect(dictionary.kanji['奉']).toEqual({ たてまつ: [0, mask('jmdict', 'inflecting')] })
  })

  it('writes a file that reads back as it was, and rejects what it cannot read', () => {
    const file = JSON.parse(formatDictionary(dictionary))
    expect(file.runs['今日']['0-1:きょう']).toEqual([92, mask('jmdict', 'ichi', 'nf')])
    expect(v.parse(DictionarySchema, file)).toEqual(dictionary)
    expect(() => v.parse(DictionarySchema, { ...file, runs: { 日本: { '0:に;1:ほん': [101, 1] } } })).toThrow(/score/)
    expect(() => v.parse(DictionarySchema, { ...file, sources: { jmdict: 2 } })).toThrow(/sources/)
  })
})

describe('pruneRuns', () => {
  const [jmdict, place, tagged] = [sourceBit('jmdict'), sourceBit('place'), sourceBit('nf')]
  const table = (runs: Record<string, Record<string, [number, number]>>): Parameters<typeof pruneRuns>[0] => ({ ...fuseDictionary({ ...sources, entries: [], places: [] }), runs })

  it('drops a run its parts read right, and gives the parts its score and sources', () => {
    const { dictionary: pruned, pruned: dropped } = pruneRuns(table({
      公認: { '0:こう;1:にん': [5, jmdict] },
      会計士: { '0:かい;1:けい;2:し': [5, jmdict] },
      公認会計士: { '0:こう;1:にん;2:かい;3:けい;4:し': [62, jmdict | tagged] },
    }))
    expect(dropped).toEqual(['公認会計士'])
    expect(Object.keys(pruned.runs)).toEqual(['公認', '会計士'])
    expect(pruned.runs['公認']).toEqual({ '0:こう;1:にん': [62, jmdict | tagged] })
  })

  it('reads a place name whole by the parts that write its reading, whatever their spans', () => {
    const { pruned: dropped } = pruneRuns(table({
      三国町: { '0-2:みくにちょう': [10, place] },
      青葉台: { '0-2:あおばだい': [10, place] },
      三国町青葉台: { '0-5:みくにちょうあおばだい': [10, place] },
    }))
    expect(dropped).toEqual(['三国町青葉台'])
  })

  it('keeps a run the parts read differently, as the longest match chooses them', () => {
    const { pruned: dropped } = pruneRuns(table({
      大人: { '0:おと;1:な': [90, jmdict] },
      大人気: { '0:だい;1:にん;2:き': [60, jmdict] },
      資本: { '0:し;1:ほん': [90, jmdict] },
      資本主: { '0:し;1:ほん;2:しゅ': [5, jmdict] },
      主義: { '0:しゅ;1:ぎ': [90, jmdict] },
      資本主義: { '0:し;1:ほん;2:しゅ;3:ぎ': [75, jmdict] },
    }))
    // 大人気 would read おとな and a bare 気; 資本主義 would read 資本主 and a bare 義.
    expect(dropped).toEqual([])
  })

  it('reads a kanji no word claims by its suffix reading, while enough runs still end with it', () => {
    const ends = (count: number): Record<string, Record<string, [number, number]>> => Object.fromEntries([...'美知科理私公性目学文化論'].slice(0, count - 1).map(k => [`${k}的`, { [`0:${k};1:てき`]: [5, jmdict] } as Record<string, [number, number]>]))
    const base: Record<string, Record<string, [number, number]>> = { 平均: { '0:へい;1:きん': [90, jmdict] }, 平均的: { '0:へい;1:きん;2:てき': [60, jmdict] } }
    // The run is one of the ten 的 ends: without it nine remain, and 的 is no suffix.
    expect(pruneRuns(table({ ...base, ...ends(10) })).pruned).toEqual([])
    expect(pruneRuns(table({ ...base, ...ends(12) })).pruned).toEqual(['平均的'])
  })

  it('keeps a run with another reading, a curated default or a JLPT level', () => {
    const parts: Record<string, Record<string, [number, number]>> = { 東京: { '0:とう;1:きょう': [90, jmdict] }, 大学: { '0:だい;1:がく': [90, jmdict] } }
    const whole = '0:とう;1:きょう;2:だい;3:がく'
    expect(pruneRuns(table({ ...parts, 東京大学: { [whole]: [60, jmdict], '0:ひがし;1:みやこ;2:だい;3:がく': [5, jmdict] } })).pruned).toEqual([])
    expect(pruneRuns(table({ ...parts, 東京大学: { [whole]: [60, jmdict | sourceBit('default')] } })).pruned).toEqual([])
    expect(pruneRuns(table({ ...parts, 東京大学: { [whole]: [60, jmdict | sourceBit('N5')] } })).pruned).toEqual([])
    expect(pruneRuns(table({ ...parts, 東京大学: { [whole]: [60, jmdict] } })).pruned).toEqual(['東京大学'])
  })
})
