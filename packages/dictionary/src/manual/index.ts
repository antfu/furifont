import * as v from 'valibot'
import { MAHJONG_YAKU } from './mahjong-yaku'

const NotationsSchema = v.array(v.string())

/**
 * Word lists kept by hand, by source name, in inline notation. A source is a
 * list written in this directory, or a file under `data/manual/` that a script
 * compiled from a web page, which bundlers split into a lazy chunk. Add a
 * source here and a build includes it, unless its plan lists the sources it wants.
 */
const MANUAL_SOURCES: Record<string, () => Promise<string[]>> = {
  'mahjong-yaku': async () => MAHJONG_YAKU,
  'yojijukugo': async () => v.parse(NotationsSchema, (await import('../../data/manual/yojijukugo.json', { with: { type: 'json' } })).default),
  'jr-stations': async () => v.parse(NotationsSchema, (await import('../../data/manual/jr-stations.json', { with: { type: 'json' } })).default),
}

export async function loadManualSources(): Promise<Record<string, string[]>> {
  return Object.fromEntries(await Promise.all(Object.entries(MANUAL_SOURCES).map(async ([name, load]) => [name, await load()])))
}
