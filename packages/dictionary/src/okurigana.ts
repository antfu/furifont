import * as v from 'valibot'
import data from '../data/okurigana.json' with { type: 'json' }
import { unpackOkurigana } from './pack'

const PackedSchema = v.record(v.string(), v.record(v.string(), v.array(v.string())))

/**
 * Words of one kanji run and the kana after it, read as a pair: 来な is こ, 来ま
 * is き, 一人も is ひとり. The longest key a text starts with decides; null marks
 * a pair that reads two ways.
 */
export const OKURIGANA: ReadonlyMap<string, string | null> = new Map(unpackOkurigana(v.parse(PackedSchema, data)))
