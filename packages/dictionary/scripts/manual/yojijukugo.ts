import { Buffer } from 'node:buffer'
/**
 * Compiles the four-character idioms of JMdict (the entries it tags `yoji`)
 * into raw/yojijukugo.json: each idiom's kanji with the first reading
 * JMdict gives it, in inline notation, one a line.
 *
 *   node scripts/manual/yojijukugo.ts
 */
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { isHan, toHiragana } from '@furifont/core'

const JMDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const OUTPUT = new URL('../../raw/yojijukugo.json', import.meta.url)

const response = await fetch(JMDICT)
if (!response.ok)
  throw new Error(`${JMDICT}: ${response.status}`)
const xml = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')

const readings = new Map<string, string>()
for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
  if (!entry!.includes('<misc>&yoji;</misc>'))
    continue
  const reading = /<reb>(.*?)<\/reb>/.exec(entry!)?.[1]
  if (!reading)
    continue
  for (const [, block] of entry!.matchAll(/<k_ele>([\s\S]*?)<\/k_ele>/g)) {
    // Irregular, outdated and rare spellings are skipped; so are forms with kana, which no run sees whole.
    const form = /<keb>(.*?)<\/keb>/.exec(block!)![1]!
    if (/<ke_inf>/.test(block!) || ![...form].every(isHan) || readings.has(form))
      continue
    readings.set(form, toHiragana(reading))
  }
}

const notations = [...readings].map(([form, reading]) => `${form}[${reading}]`).sort((a, b) => a.localeCompare(b, 'ja'))
await writeFile(OUTPUT, `[\n${notations.map(n => JSON.stringify(n)).join(',\n')}\n]\n`)
console.log(`Wrote ${notations.length} idioms`)
