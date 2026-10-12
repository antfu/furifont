/**
 * Downloads JMdict, JmdictFurigana and KANJIDIC2 and compiles them into
 * data/dictionary.json, one (form, reading) entry per line so updates diff well.
 *
 *   node scripts/update.ts
 */
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const JMDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const FURIGANA_RELEASE = 'https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest'
const OUTPUT = new URL('../data/dictionary.json', import.meta.url)

const HAN = /\p{Script=Han}/u

async function download(url: string, gzipped = false): Promise<string> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`${url}: ${response.status} ${response.statusText}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
}
const all = (xml: string, tag: string): string[] => [...xml.matchAll(new RegExp(`<${tag}>(.*?)</${tag}>`, 'gs'))].map(m => m[1]!)

function toHiragana(katakana: string): string {
  return katakana.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

/** `word|reading|0:に;1:ほん` lines, keyed by `word|reading`. */
function parseFurigana(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of source.replace(/^\uFEFF/, '').split('\n')) {
    const [word, reading, furigana] = line.trim().split('|')
    if (word && reading && furigana)
      map.set(`${word}|${reading}`, furigana)
  }
  return map
}

type Entry = [form: string, furigana: string, nf: number, priority: string, order: number, conjugatesReading?: 1]

/**
 * A (form, reading) pair is common only when the form itself is: a reading's
 * priority tags count when the written form also carries some, and a form's
 * own tags pass to its reading when it has no other.
 */
function parseJmdict(xml: string, furigana: Map<string, string>): Entry[] {
  const entries: Entry[] = []
  for (const [, body] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const conjugatesReading = body!.includes('<pos>&vk;</pos>')
    const readings = all(body!, 'r_ele').filter(r => !r.includes('<re_nokanji/>') && !r.includes('&sk;'))
    for (const kanji of all(body!, 'k_ele')) {
      const form = all(kanji, 'keb')[0]!
      if (!HAN.test(form) || kanji.includes('&sK;'))
        continue
      const formPriority = all(kanji, 'ke_pri')
      const nf = Number(/nf(\d+)/.exec(formPriority.join(' '))?.[1] ?? 0)
      const valid = readings.filter((r) => {
        const restrictions = all(r, 're_restr')
        return !restrictions.length || restrictions.includes(form)
      })
      valid.forEach((r, order) => {
        const reading = all(r, 'reb')[0]!
        const aligned = furigana.get(`${form}|${reading}`)
        if (!aligned)
          return
        const tags = formPriority.length ? [...new Set([...all(r, 're_pri'), ...(valid.length === 1 ? formPriority : [])])] : []
        const entry: Entry = [form, aligned, nf, tags.join(' '), order]
        if (conjugatesReading)
          entry.push(1)
        entries.push(entry)
      })
    }
  }
  return entries
}

function parseKanjidic(xml: string): Record<string, string[]> {
  const onyomi: Record<string, string[]> = {}
  for (const [, body] of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const on = [...body!.matchAll(/<reading r_type="ja_on">(.*?)<\/reading>/g)].map(m => toHiragana(m[1]!))
    if (on.length)
      onyomi[all(body!, 'literal')[0]!] = on
  }
  return onyomi
}

const release = await (await fetch(FURIGANA_RELEASE)).json() as { tag_name: string, assets: { name: string, browser_download_url: string }[] }
const asset = release.assets.find(a => a.name === 'JmdictFurigana.txt')
if (!asset)
  throw new Error(`JmdictFurigana ${release.tag_name} has no JmdictFurigana.txt asset`)

console.log('Downloading JMdict, JmdictFurigana and KANJIDIC2...')
const [jmdict, furigana, kanjidic] = await Promise.all([
  download(JMDICT, true),
  download(asset.browser_download_url),
  download(KANJIDIC2, true),
])

const entries = parseJmdict(jmdict, parseFurigana(furigana))
const onyomi = parseKanjidic(kanjidic)
const used = new Set(entries.flatMap(([form]) => [...form]))
const sources = {
  JMdict: /JMdict created: ([\d-]+)/.exec(jmdict)?.[1] ?? 'unknown',
  JmdictFurigana: release.tag_name,
  KANJIDIC2: /<date_of_creation>([\d-]+)</.exec(kanjidic)?.[1] ?? 'unknown',
}

const lines = [
  '{',
  `"sources": ${JSON.stringify(sources)},`,
  `"onyomi": ${JSON.stringify(Object.fromEntries(Object.entries(onyomi).filter(([k]) => used.has(k))))},`,
  '"entries": [',
  entries.map(e => JSON.stringify(e)).join(',\n'),
  ']',
  '}',
]
await writeFile(OUTPUT, `${lines.join('\n')}\n`)
console.log(`Wrote ${entries.length} entries, ${Object.keys(onyomi).length} kanji (${JSON.stringify(sources)})`)
