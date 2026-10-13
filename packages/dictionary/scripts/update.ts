/**
 * Downloads JMdict, JMnedict, their JmdictFurigana alignments and KANJIDIC2, and
 * compiles them into data/dictionary.json and data/places.json, one entry per
 * line so updates diff well.
 *
 *   node scripts/update.ts
 */
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const JMDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const JMNEDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMnedict.xml.gz'
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const FURIGANA_RELEASE = 'https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest'
const OUTPUT = new URL('../data/dictionary.json', import.meta.url)
const PLACES = new URL('../data/places.json', import.meta.url)

const HAN = /\p{Script=Han}/u
const ALL_HAN = /^\p{Script=Han}{2,}$/u

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

/**
 * Place names a font can read: a station's own reading where the place has a
 * station (JMnedict lists 新宿駅 しんじゅくえき), otherwise the place's only
 * reading. Names spelled all in kanji, two or more, since a font reads runs of kanji.
 */
function parseJmnedict(xml: string, furigana: Map<string, string>): [form: string, furigana: string][] {
  const stations = new Map<string, string>()
  const places = new Map<string, Set<string>>()
  for (const [, body] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const types = all(body!, 'name_type')
    const reading = all(body!, 'reb')[0]!
    for (const form of all(body!, 'keb')) {
      if (types.includes('&station;'))
        stationName(form, reading, furigana, stations)
      else if (types.includes('&place;') && ALL_HAN.test(form))
        getOrCreate(places, form).add(reading)
    }
  }
  const chosen = new Map(stations)
  for (const [form, readings] of places) {
    const aligned = readings.size === 1 ? furigana.get(`${form}|${[...readings][0]}`) : undefined
    if (!chosen.has(form) && aligned)
      chosen.set(form, aligned)
  }
  return [...chosen].sort((a, b) => a[0].localeCompare(b[0]))
}

/** 新宿駅 しんじゅくえき, aligned 0:しん;1:じゅく;2:えき, names 新宿 0:しん;1:じゅく. */
function stationName(form: string, reading: string, furigana: Map<string, string>, stations: Map<string, string>): void {
  const name = form.replace(/駅$/, '')
  const aligned = furigana.get(`${form}|${reading}`)
  if (name === form || !ALL_HAN.test(name) || stations.has(name) || !aligned)
    return
  const station = `${[...name].length}:えき`
  if (aligned.endsWith(`;${station}`))
    stations.set(name, aligned.slice(0, -station.length - 1))
}

function getOrCreate(map: Map<string, Set<string>>, key: string): Set<string> {
  let value = map.get(key)
  if (!value)
    map.set(key, value = new Set())
  return value
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
function assetUrl(name: string): string {
  const asset = release.assets.find(a => a.name === name)
  if (!asset)
    throw new Error(`JmdictFurigana ${release.tag_name} has no ${name} asset`)
  return asset.browser_download_url
}

console.log('Downloading JMdict, JMnedict, JmdictFurigana and KANJIDIC2...')
const [jmdict, jmnedict, furigana, namesFurigana, kanjidic] = await Promise.all([
  download(JMDICT, true),
  download(JMNEDICT, true),
  download(assetUrl('JmdictFurigana.txt')),
  download(assetUrl('JmnedictFurigana.txt')),
  download(KANJIDIC2, true),
])

const entries = parseJmdict(jmdict, parseFurigana(furigana))
const places = parseJmnedict(jmnedict, parseFurigana(namesFurigana))
const onyomi = parseKanjidic(kanjidic)
const used = new Set(entries.flatMap(([form]) => [...form]))
const sources = {
  JMdict: /JMdict created: ([\d-]+)/.exec(jmdict)?.[1] ?? 'unknown',
  JMnedict: /JMnedict created: ([\d-]+)/.exec(jmnedict)?.[1] ?? 'unknown',
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
await writeFile(PLACES, `[\n${places.map(p => JSON.stringify(p)).join(',\n')}\n]\n`)
console.log(`Wrote ${entries.length} entries, ${places.length} places, ${Object.keys(onyomi).length} kanji (${JSON.stringify(sources)})`)
