import type { Source } from '../src'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { DictionarySchema, formatDictionary, formatNotation, fuseDictionary, hanRuns, parseFurigana, parseNotation, sourceBit } from '../src'
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
