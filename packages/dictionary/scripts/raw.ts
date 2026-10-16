/**
 * The datasets under raw/ that curated overrides can amend, and the
 * `<dataset>.overrides.jsonc` file beside each: an array of entries in inline
 * notation, with the reason and the reporters as comments.
 *
 *   // 出来る, 出来た: しゅったい is rare.
 *   "出[で]来[き]",
 *   // Left bare: the reading depends on the word around it.
 *   "月",
 *
 * An entry is added to its dataset as one of its own rows and pins its reading
 * as the default. A bare kanji run, with no reading, is left without ruby.
 * `jlpt` and `tatoeba` rows carry a number as well: `["今日[きょう]", 5]` is the
 * JLPT level, and for `tatoeba` the uses in the sentences.
 */
import { readFile } from 'node:fs/promises'
import { MANUAL_SOURCES } from '@furifont/core'
import * as v from 'valibot'

const RAW = new URL('../raw/', import.meta.url)

/** Every dataset with an overrides file; raw/okurigana.json has no words to amend. */
export const DATASETS = ['jmdict', 'places', 'jlpt', 'tatoeba', ...MANUAL_SOURCES] as const
export type Dataset = typeof DATASETS[number]

/** A notation, or with its number: the JLPT level of a `jlpt` row, the uses of a `tatoeba` row. */
export type Override = string | [string, number]
const OverridesSchema = v.array(v.union([v.string(), v.tuple([v.string(), v.pipe(v.number(), v.integer(), v.minValue(1))])]))

export const rawFile = (name: string): URL => new URL(`${name}.json`, RAW)
export const overridesFile = (name: Dataset | 'okurigana'): URL => new URL(`${name}.overrides.jsonc`, RAW)

/** Where the string starting at `at` ends, past its closing quote. */
function stringEnd(text: string, at: number): number {
  let end = at + 1
  while (text[end] !== '"')
    end += text[end] === '\\' ? 2 : 1
  return end + 1
}

/** JSON without its comments and trailing commas, as a string. */
function stripJsonc(text: string): string {
  const parts: string[] = []
  let i = 0
  while (i < text.length) {
    const pair = text.slice(i, i + 2)
    const end = text[i] === '"'
      ? stringEnd(text, i)
      : pair === '//' ? (text.indexOf('\n', i) + 1 || text.length) : pair === '/*' ? text.indexOf('*/', i) + 2 : 0
    // A comment leaves a newline; a string stays.
    parts.push(end ? (text[i] === '"' ? text.slice(i, end) : '\n') : text[i]!)
    i = end || i + 1
  }
  return parts.join('').replace(/,(\s*\])/g, '$1')
}

export const notationOf = (entry: Override): string => typeof entry === 'string' ? entry : entry[0]
export const numberOf = (entry: Override): number | undefined => typeof entry === 'string' ? undefined : entry[1]
/** The kanji run of an entry, with or without its reading. */
export const formOf = (entry: Override): string => notationOf(entry).replace(/\[[^\]]*\]/g, '')
/** A bare entry has no reading in brackets. */
export const isBare = (entry: Override): boolean => !notationOf(entry).includes('[')

async function readOverrides(name: Dataset | 'okurigana'): Promise<Override[]> {
  let text: string
  try {
    text = await readFile(overridesFile(name), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []
    throw error
  }
  return v.parse(OverridesSchema, JSON.parse(stripJsonc(text)))
}

const PAIR = /^((?:\p{sc=Han}+\[[^\]]+\])+)([^\p{sc=Han}[\]].*)$/u
const BARE_PAIR = /^\p{sc=Han}+[^\p{sc=Han}[\]].*$/u

/**
 * An okurigana override as a pair: `上[うえ]に` reads 上 as うえ before に, and `上が`,
 * with no reading, leaves it to the font. The key is the kanji and the kana, as in raw/okurigana.json.
 */
export function parsePair(entry: string): [key: string, reading: string | null] | undefined {
  const pinned = PAIR.exec(entry)
  if (pinned)
    return [pinned[1]!.replace(/\[[^\]]*\]/g, '') + pinned[2], [...pinned[1]!.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]).join('')]
  const bare = BARE_PAIR.exec(entry)
  return bare ? [bare[0], null] : undefined
}

/** The pairs of raw/okurigana.overrides.jsonc, which replace the generated ones. */
export async function readPairOverrides(): Promise<[key: string, reading: string | null][]> {
  return (await readOverrides('okurigana')).map((e) => {
    const pair = parsePair(notationOf(e))
    if (!pair)
      throw new Error(`"${notationOf(e)}" in okurigana.overrides.jsonc is not a pair like 上[うえ]に.`)
    return pair
  })
}

export async function readAllOverrides(): Promise<Record<Dataset, Override[]>> {
  return Object.fromEntries(await Promise.all(DATASETS.map(async name => [name, await readOverrides(name)]))) as Record<Dataset, Override[]>
}
