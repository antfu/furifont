import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { DictionarySchema, formatDictionary, formatNotation, fuseDictionary, hanRuns, parseFurigana, parseNotation } from '../src'
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
  it('merges each reading of a run across entries and sources', () => {
    const fused = fuseDictionary({ ...sources, places: [{ form: '日本', furigana: '0:に;1:ほん' }], defaults: ['今[こん]日[にち]'] })
    expect(fused.runs['日本']).toEqual({ '0:に;1:ほん': { jmdict: 0, rank: 1, nf: 1, ichi1: true, news1: true, place: true } })
    // 今日 alone, and 今日 inside 今日は, which ranks after the word's own readings.
    expect(fused.runs['今日']?.['0:こん;1:にち']).toEqual({ jmdict: 1, rank: 2, nf: 2, ichi1: true, news1: true, default: true })
  })

  it('reads a lone kanji by its tagged words, or by an untagged one before okurigana', () => {
    expect(Object.keys(dictionary.kanji['来']!)).toEqual(['く', 'き', 'こ'])
    expect(dictionary.kanji['奉']).toEqual({ たてまつ: { inflecting: true } })
  })

  it('writes a file that reads back as it was, and rejects what is no source', () => {
    const file = JSON.parse(formatDictionary(dictionary))
    expect(file.runs['今日']['0-1:きょう']).toBe('jmdict:0 rank:2 nf:2 ichi1')
    expect(v.parse(DictionarySchema, file)).toEqual(dictionary)
    expect(() => v.parse(DictionarySchema, { ...file, runs: { 日本: { '0:に;1:ほん': 'nf:49' } } })).toThrow(/nf:49/)
    expect(() => v.parse(DictionarySchema, { ...file, runs: { 日本: { '0:に;1:ほん': 'place:1' } } })).toThrow(/place:1/)
  })
})
