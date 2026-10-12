import { describe, expect, it } from 'vitest'
import { formatNotation, hanRuns, parseFurigana, parseNotation } from '../src'

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
