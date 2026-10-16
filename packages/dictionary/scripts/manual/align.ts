import { isHan, toHiragana } from '@furifont/core'

/**
 * Splits a name's reading over its runs of kanji, the kana between them
 * matching as written. Names with other marks, or that fit no way, give none.
 */
export function alignRuns(name: string, reading: string): [run: string, reading: string][] {
  const parts = [...name].reduce<string[]>((acc, char) => {
    if (acc.length && isHan(acc.at(-1)![0]!) === isHan(char))
      acc[acc.length - 1] += char
    else
      acc.push(char)
    return acc
  }, [])
  // ヶ reads が or け: it stands for one kana of either.
  const pattern = parts.map(part => isHan(part[0]!) ? '(.+?)' : [...toHiragana(part)].map(c => c === 'ゖ' ? '[がけ]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')).join('')
  const match = new RegExp(`^${pattern}$`).exec(reading)
  if (!match || /[^\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー]/u.test(name))
    return []
  return parts.filter(part => isHan(part[0]!)).map((run, i) => [run, match[i + 1]!])
}
