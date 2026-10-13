import * as v from 'valibot'
import data from '../data/okurigana.json' with { type: 'json' }

/**
 * Words of one kanji run and the kana after it, read as a pair: 来な is こ, 来ま
 * is き. The longest key a text starts with decides; null marks a pair that
 * reads two ways.
 */
export const OKURIGANA: ReadonlyMap<string, string | null> = new Map(v.parse(v.array(v.tuple([v.string(), v.nullable(v.string())])), data))
