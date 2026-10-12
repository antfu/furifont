import { describe, expect, it } from 'vitest'
import { isOnyomi, toHepburn, toKatakana } from '../src'

describe('kana', () => {
  it('converts hiragana to katakana', () => {
    expect(toKatakana('にほんご')).toBe('ニホンゴ')
  })

  it('recognises on\'yomi as they surface in words', () => {
    expect(isOnyomi('がく', ['がく'])).toBe(true)
    expect(isOnyomi('がっ', ['がく'])).toBe(true)
    expect(isOnyomi('ぼん', ['ほん'])).toBe(true)
    expect(isOnyomi('ぽん', ['ほん'])).toBe(true)
    expect(isOnyomi('まな', ['がく'])).toBe(false)
  })

  it.each([
    ['きょう', '', 'kyō'],
    ['とうきょう', '', 'tōkyō'],
    ['おおきい', '', 'ōkii'],
    ['しんぶん', '', 'shinbun'],
    ['きんえん', '', 'kin\'en'],
    ['いっぱい', '', 'ippai'],
    ['まっちゃ', '', 'matcha'],
    ['じゅう', '', 'jū'],
    ['がっ', 'こう', 'gak'],
    ['いっ', 'しょ', 'is'],
  ])('romanizes %s (before %s) as %s', (kana, following, romaji) => {
    expect(toHepburn(kana, following)).toBe(romaji)
  })
})
