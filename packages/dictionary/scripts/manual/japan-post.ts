/**
 * Compiles Japan Post's postal code data (KEN_ALL, which names every
 * prefecture's municipalities and towns with their readings) into
 * raw/japan-post.json: the kanji runs of those names with the reading each
 * takes, in inline notation, one a line. Japan Post's own download is not
 * reachable from everywhere, so the file comes from the zipcloud mirror, which
 * republishes it every month.
 *
 *   node scripts/manual/japan-post.ts
 */
import { writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { hanRuns, parseNotation, toHiragana } from '@furifont/core'
import { alignRuns } from './align.ts'

const URL_MIRROR = 'http://zipcloud.ibsnet.co.jp/'
const OUTPUT = new URL('../../raw/japan-post.json', import.meta.url)
/** Filler rows and notes that name no place. */
const NOT_A_PLACE = /場合|一円|次に/

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response
}

/** The first file of a zip archive, read through its central directory. */
function unzip(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let end = zip.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054B50)
    end--
  if (end < 0)
    throw new Error('Not a zip file')
  const entry = view.getUint32(end + 16, true)
  const [method, size, local] = [view.getUint16(entry + 10, true), view.getUint32(entry + 20, true), view.getUint32(entry + 42, true)]
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
  const data = zip.subarray(start, start + size)
  if (method === 0)
    return data
  if (method === 8)
    return inflateRawSync(data)
  throw new Error(`Zip method ${method} is not supported`)
}

/** The rows of the month's full file: the municipality and the town, each with its reading in hiragana. */
async function fetchRows(): Promise<{ muni: string, muniReading: string, town: string, townReading: string }[]> {
  const page = await (await fetchOk(URL_MIRROR)).text()
  // The page lists the full file, the changes and an extended file; the full file is `ken-all<yyyymm>.zip`.
  const href = /fnColumn">ken-all\d+\.zip<[\s\S]*?href="([^"]+)"/.exec(page)?.[1]
  if (!href)
    throw new Error(`${URL_MIRROR} lists no ken-all file`)
  const zip = new Uint8Array(await (await fetchOk(new URL(href, URL_MIRROR).href)).arrayBuffer())
  const text = new TextDecoder('shift_jis').decode(unzip(zip))
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const cells = line.split(',').map(cell => cell.replace(/^"|"$/g, ''))
    if (cells.length !== 15)
      throw new Error(`Unexpected row: ${line}`)
    // Half-width katakana become full-width, then hiragana.
    const reading = (kana: string): string => toHiragana(kana.normalize('NFKC'))
    return { muni: cells[7]!, muniReading: reading(cells[4]!), town: cells[8]!, townReading: reading(cells[5]!) }
  })
}

/**
 * A municipality as the runs of its names: the district (長生郡) and the
 * municipality (一宮町) apart when the reading splits at one ぐん only.
 */
function municipalityNames(muni: string, reading: string): [name: string, reading: string][] {
  const at = muni.indexOf('郡')
  if (at < 1)
    return [[muni, reading]]
  const [district, rest] = [muni.slice(0, at + 1), muni.slice(at + 1)]
  const splits = [...reading.matchAll(/ぐん/g)].map(m => m.index + 2).filter(i => alignRuns(rest, reading.slice(i)).length)
  return splits.length === 1 ? [[district, reading.slice(0, splits[0])], [rest, reading.slice(splits[0])]] : []
}

const rows = await fetchRows()

// Each place counts a reading once, however many postal codes it has.
const readings = new Map<string, Map<string, Set<string>>>()
function count(name: string, reading: string, place: string): void {
  // One run only: with several, the reading would split between them in more than one way.
  const runs = alignRuns(name, reading)
  if (runs.length !== 1 || [...runs[0]![0]].length < 2)
    return
  const [run, ruby] = runs[0]!
  const byReading = readings.get(run) ?? readings.set(run, new Map()).get(run)!
  ;(byReading.get(ruby) ?? byReading.set(ruby, new Set()).get(ruby)!).add(place)
}
for (const { muni, muniReading, town, townReading } of rows) {
  for (const [name, reading] of municipalityNames(muni, muniReading))
    count(name, reading, muni)
  if (!NOT_A_PLACE.test(town))
    count(town, townReading, `${muni}|${town}`)
}

// A name read two ways keeps the reading most places use, if more than half do.
let ambiguous = 0
const notations: string[] = []
for (const [run, byReading] of readings) {
  const places = [...byReading.values()].reduce((sum, set) => sum + set.size, 0)
  const [ruby, set] = [...byReading].sort((a, b) => b[1].size - a[1].size)[0]!
  if (byReading.size > 1)
    ambiguous++
  if (set.size * 2 > places)
    notations.push(`${run}[${ruby}]`)
}
notations.sort((a, b) => a.localeCompare(b, 'ja'))
for (const notation of notations) {
  const { form, spans } = parseNotation(notation)
  if (hanRuns(form, spans).length !== 1)
    throw new Error(`${notation} does not read as one run`)
}

await writeFile(OUTPUT, `[\n${notations.map(n => JSON.stringify(n)).join(',\n')}\n]\n`)
console.log(`Wrote ${notations.length} runs from ${rows.length} rows, ${ambiguous} of them read more than one way (${readings.size - notations.length} left out)`)
