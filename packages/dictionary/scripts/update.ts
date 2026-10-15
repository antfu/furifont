/**
 * Downloads JMdict, JMnedict, their JmdictFurigana alignments, KANJIDIC2, the
 * JLPT word lists and Tatoeba's example sentences, and compiles them into
 * raw/jmdict.json, raw/places.json, raw/okurigana.json (packed by run of
 * kanji, as pages read it), raw/jlpt.json and raw/tatoeba.json, one entry
 * per line so updates diff well. `scripts/compile.ts` fuses them.
 *
 *   node scripts/update.ts
 */
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { hanRuns, parseFurigana } from '@furifont/core'
import { formatPacked, packOkurigana } from '../src/okurigana.ts'

const JMDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const JMNEDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMnedict.xml.gz'
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
/** Tatoeba's Japanese sentences with their words indexed to JMdict, as EDRDG distributes them. */
const TATOEBA = 'http://ftp.edrdg.org/pub/Nihongo/examples.utf.gz'
const TATOEBA_DATE = 'http://www.edrdg.org/examples/examples_date'
const FURIGANA_RELEASE = 'https://api.github.com/repos/Doublevil/JmdictFurigana/releases/latest'
/** Jonathan Waller's JLPT lists, tied to JMdict entries; pinned, as the lists no longer change. */
const JLPT_VOCAB = '2025.08.01.0'
const JLPT_LEVELS = [5, 4, 3, 2, 1]
const OUTPUT = new URL('../raw/jmdict.json', import.meta.url)
const PLACES = new URL('../raw/places.json', import.meta.url)
const OKURIGANA = new URL('../raw/okurigana.json', import.meta.url)
const JLPT = new URL('../raw/jlpt.json', import.meta.url)
const TATOEBA_OUTPUT = new URL('../raw/tatoeba.json', import.meta.url)

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
function parseAlignments(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of source.replace(/^\uFEFF/, '').split('\n')) {
    const [word, reading, furigana] = line.trim().split('|')
    if (word && reading && furigana)
      map.set(`${word}|${reading}`, furigana)
  }
  return map
}

const VOWELS: Record<string, string> = {}
for (const [vowel, kana] of Object.entries({ あ: 'ぁあかがさざただなはばぱまゃやらゎわ', い: 'ぃいきぎしじちぢにひびぴみり', う: 'ぅうくぐすずっつづぬふぶぷむゅゆるゔ', え: 'ぇえけげせぜてでねへべぺめれ', お: 'ぉおこごそぞとどのほぼぽもょよろを' })) {
  for (const k of kana)
    VOWELS[k] = vowel
}

/**
 * The reading as JmdictFurigana spells it: hiragana, with the long vowel mark
 * written as the vowel it lengthens. JMdict has 麻雀 マージャン and まーじゃん
 * where the alignments have まあじゃん.
 */
function alignmentReading(reading: string): string {
  let out = ''
  for (const char of toHiragana(reading))
    out += char === 'ー' ? VOWELS[out.at(-1)!] ?? char : char
  return out
}

/** Writes the long vowel marks of `reading` back into an alignment that spells them as vowels (まあ → まー). */
function restoreLongMarks(aligned: string, reading: string): string {
  const kana = [...toHiragana(reading)]
  let at = 0
  return aligned.split(';').map((part) => {
    const [range, ruby = ''] = part.split(':')
    return `${range}:${[...ruby].map(char => kana[at++] === 'ー' ? 'ー' : char).join('')}`
  }).join(';')
}

type Entry = [form: string, furigana: string, nf: number, priority: string, order: number, conjugatesReading?: 1]

/** A (form, reading) pair with what the okurigana table needs: its JMdict entry and how it conjugates. */
interface Word {
  entry: number
  form: string
  reading: string
  furigana: string
  order: number
  common: boolean
  classes: string[]
}

type JlptEntry = [form: string, furigana: string, level: number]

/**
 * `jmdict_seq,kana,kanji,definition` rows of each level, as `seq|kanji|kana` to
 * the easiest level listing it. A learner knows the word as the list writes
 * it: words listed in kana and the entry's other spellings (遭う for 会う) are left out.
 */
function parseJlpt(lists: string[]): Map<string, number> {
  const levels = new Map<string, number>()
  lists.forEach((csv, i) => {
    for (const line of csv.trim().split('\n').slice(1)) {
      const [seq, kana, kanji] = line.split(',')
      const key = `${seq}|${kanji}|${kana}`
      if (kanji)
        levels.set(key, Math.max(levels.get(key) ?? 0, JLPT_LEVELS[i]!))
    }
  })
  return levels
}

/**
 * A (form, reading) pair is common only when the form itself is: a reading's
 * priority tags count when the written form also carries some, and a form's
 * own tags pass to its reading when it has no other.
 */
function parseJmdict(xml: string, furigana: Map<string, string>, jlptLevels: Map<string, number>): { entries: Entry[], words: Word[], jlpt: JlptEntry[] } {
  const entries: Entry[] = []
  const words: Word[] = []
  const jlpt: JlptEntry[] = []
  const normalized = new Map([...furigana].map(([key, aligned]) => {
    const [word, reading] = key.split('|')
    return [`${word}|${alignmentReading(reading!)}`, aligned]
  }))
  for (const [entry, [, body]] of [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].entries()) {
    const seq = all(body!, 'ent_seq')[0]
    const conjugatesReading = body!.includes('<pos>&vk;</pos>')
    const classes = [...new Set(all(body!, 'pos').map(pos => pos.slice(1, -1)))]
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
        const exact = furigana.get(`${form}|${reading}`)
        const near = exact ? undefined : normalized.get(`${form}|${alignmentReading(reading)}`)
        const aligned = exact ?? (near && restoreLongMarks(near, reading))
        if (!aligned)
          return
        const tags = formPriority.length ? [...new Set([...all(r, 're_pri'), ...(valid.length === 1 ? formPriority : [])])] : []
        const row: Entry = [form, aligned, nf, tags.join(' '), order]
        if (conjugatesReading)
          row.push(1)
        entries.push(row)
        words.push({ entry, form, reading, furigana: aligned, order, common: tags.length > 0, classes })
        const level = jlptLevels.get(`${seq}|${form}|${reading}`)
        if (level)
          jlpt.push([form, aligned, level])
      })
    }
  }
  return { entries, words, jlpt }
}

type TatoebaEntry = [form: string, furigana: string, uses: number]

/** `headword(reading)[sense]{as written}~`, where `(#seq)` names a JMdict entry rather than a reading. */
const INDEXED_WORD = /^([^({[~]+)((?:\([^)]*\))*)(?:\[\d+\])?(?:\{([^}]*)\})?~?$/
const hanOf = (text: string): string => text.replace(/\P{Script=Han}/gu, '')

const DIGITS = /[0-9\uFF10-\uFF19]/
const add = (map: Map<string, number>, key: string, n: number): void => void map.set(key, (map.get(key) ?? 0) + n)

/**
 * How often the sentences' `B:` lines use each word as JMdict spells it in
 * kanji, by `form|reading`; `form|` where the line gives no reading, which
 * it does when the form reads one way or as its first reading. Words written
 * with digits, as ３人 for 三人, are kept apart by the kanji written.
 */
function countUses(sentences: string): { uses: Map<string, number>, withDigits: Map<string, number> } {
  const uses = new Map<string, number>()
  const withDigits = new Map<string, number>()
  for (const line of sentences.split('\n')) {
    if (!line.startsWith('B: '))
      continue
    for (const word of line.slice(3).split(' ')) {
      const [, form, notes, written = form] = INDEXED_WORD.exec(word) ?? []
      const key = `${form}|${/\(([^)#][^)]*)\)/.exec(notes!)?.[1] ?? ''}`
      // Only the spelling a font sees counts: 兎 written ウサギ is no use of 兎.
      if (form && hanOf(form) && hanOf(form) === hanOf(written!))
        add(uses, key, 1)
      else if (form && DIGITS.test(written!) && hanOf(written!) && hanOf(form).endsWith(hanOf(written!)))
        add(withDigits, `${key}|${hanOf(written!)}`, 1)
    }
  }
  return { uses, withDigits }
}

/** The reading of `form`'s last kanji `tail`, as 人 にん in 三人 さんにん; none when a span crosses into it, as in 二人 ふたり. */
function tailReading(form: string, furigana: string, tail: string): string | undefined {
  const chars = [...form]
  const start = chars.join('').lastIndexOf(tail)
  const at = [...chars.join('').slice(0, start)].length
  if (start < 0 || chars.slice(at + [...tail].length).some(c => HAN.test(c)))
    return
  const spans = parseFurigana(furigana).filter(s => s.end > at && s.start < at + [...tail].length)
  if (spans.some(s => s.start < at) || spans.reduce((n, s) => n + s.end - s.start, 0) !== [...tail].length)
    return
  return spans.map(s => s.ruby).join('')
}

/**
 * Uses of each (form, reading) pair; a use with no reading counts only when
 * the form's entries agree on their first one. A number written in digits
 * counts for the kanji after it, as ３人 does for 人 にん: a font sees them alone.
 */
function compileTatoeba(sentences: string, words: Word[]): TatoebaEntry[] {
  const { uses, withDigits } = countUses(sentences)
  const firsts = new Map<string, Set<string>>()
  for (const word of words.filter(w => w.order === 0))
    getOrCreate(firsts, word.form).add(word.reading)
  const aligned = new Map(words.map(w => [`${w.form}|${w.reading}`, w.furigana]))
  for (const [key, n] of withDigits) {
    const [form, given, tail] = key.split('|') as [string, string, string]
    const reading = given || (firsts.get(form)?.size === 1 ? [...firsts.get(form)!][0] : undefined)
    const furigana = reading && aligned.get(`${form}|${reading}`)
    const read = furigana && tailReading(form, furigana, tail)
    if (read)
      add(uses, `${tail}|${read}`, n)
  }
  const counted = new Map<string, TatoebaEntry>()
  for (const { form, reading, furigana, order } of words) {
    const implied = order === 0 && firsts.get(form)!.size === 1 ? uses.get(`${form}|`) ?? 0 : 0
    const n = (uses.get(`${form}|${reading}`) ?? 0) + implied
    if (n)
      counted.set(`${form}|${furigana}`, [form, furigana, n])
  }
  return [...counted.values()]
}

const GODAN_ROWS: Record<string, string> = { う: 'わいうえお', く: 'かきくけこ', ぐ: 'がぎぐげご', す: 'さしすせそ', つ: 'たちつてと', ぬ: 'なにぬねの', ぶ: 'ばびぶべぼ', む: 'まみむめも', る: 'らりるれろ' }
const GODAN_ONBIN: Record<string, string> = { う: 'っ', く: 'い', ぐ: 'い', す: 'し', つ: 'っ', ぬ: 'ん', ぶ: 'ん', む: 'ん', る: 'っ' }
const MASU = ['', 'ます', 'ました', 'ません', 'たい', 'ながら', 'そう', 'やすい', 'にくい', 'に', 'つつ']
const ICHIDAN = ['る', 'れば', 'ろ', 'よう', 'ない', 'なかった', 'させる', 'られる', 'ず', 'た', 'て', ...MASU]
const ADJECTIVE = ['', 'い', 'く', 'くて', 'くない', 'かった', 'ければ', 'さ', 'そう', 'すぎる', 'み', 'げ']
/** 来る: its kanji reads く, こ or き by what follows. */
const KURU: Record<string, string[]> = { く: ['る', 'れば'], こ: ['ない', 'なかった', 'よう', 'させる', 'られる', 'い', 'ず'], き: ['た', 'て', ...MASU.slice(1)] }
const SURU = ['する', 'すれば', 'しない', 'します', 'した', 'して', 'しろ', 'せよ', 'される', 'させる', 'せず']
const ZURU = ['ずる', 'ずれば', 'じる', 'じない', 'じます', 'じた', 'じて', 'ぜず']

interface Form {
  reading: string
  okurigana: string
  /** A bare stem, as 読ま or 食べ: weaker evidence than a whole form. */
  stem: boolean
}

function forms(reading: string, base: string, endings: string[], stems = true): Form[] {
  return endings.map(e => ({ reading, okurigana: base + e, stem: stems && !e }))
}

function godan(pos: string, okurigana: string, reading: string): Form[] {
  const stem = okurigana.slice(0, -1)
  const last = okurigana.slice(-1)
  const row = GODAN_ROWS[last]!
  const onbin = pos === 'v5k-s' ? 'っ' : pos === 'v5u-s' ? 'う' : GODAN_ONBIN[last]!
  return [
    ...forms(reading, stem + row[0], ['', 'ない', 'なかった', 'せる', 'れる', 'ず']),
    ...forms(reading, stem + row[1], MASU),
    ...forms(reading, stem, [row[2]!, `${row[2]}な`, ...(pos === 'v5aru' ? ['い', 'います', 'いません'] : [])]),
    ...forms(reading, stem + row[3], ['', 'ば', 'る', 'ない', 'ます', 'た', 'て'], false),
    ...forms(reading, stem + row[4], ['', 'う']),
    ...forms(reading, stem + onbin, ['', ...'ぐぬぶむ'.includes(last) ? ['で', 'だ'] : ['て', 'た']]),
  ]
}

/** The forms one JMdict conjugation class gives, or none when the word is not written as the class conjugates. */
function conjugateAs(pos: string, okurigana: string, reading: string): Form[] {
  const last = okurigana.slice(-1)
  if (pos === 'vk' && okurigana === 'る' && reading.endsWith('く'))
    return Object.entries(KURU).flatMap(([kana, endings]) => forms(reading.slice(0, -1) + kana, '', endings))
  if (pos.startsWith('v5') && GODAN_ROWS[last])
    return godan(pos, okurigana, reading)
  if ((pos === 'v1' || pos === 'v1-s') && last === 'る')
    return forms(reading, okurigana.slice(0, -1), ICHIDAN)
  if ((pos === 'adj-i' || pos === 'adj-ix') && last === 'い')
    return forms(reading, okurigana.slice(0, -1), ADJECTIVE)
  if ((pos === 'vs-s' || pos === 'vs-i') && okurigana === 'する')
    return forms(reading, '', SURU)
  if (pos === 'vz' && okurigana === 'ずる')
    return forms(reading, '', ZURU)
  return []
}

/** The okurigana a word takes as it conjugates, each with the reading of the kanji before it. */
function conjugate(okurigana: string, reading: string, classes: string[]): Form[] {
  const conjugated = classes.flatMap(pos => conjugateAs(pos, okurigana, reading))
  return conjugated.length ? conjugated : [{ reading, okurigana, stem: false }]
}

/** A word written as one run of kanji and the kana after it, as 読み or 美味しい, with the run's reading. */
function splitWord(form: string, furigana: string): { run: string, reading: string, kana: string } | undefined {
  const match = /^(\p{Script=Han}+)(\P{Script=Han}*)$/u.exec(form)
  const spans = parseFurigana(furigana)
  const length = [...match?.[1] ?? ''].length
  if (match && spans.every(s => s.end <= length && s.ruby) && spans.reduce((n, s) => n + s.end - s.start, 0) === length)
    return { run: match[1]!, reading: spans.map(s => s.ruby).join(''), kana: match[2]! }
}

/** Kana a noun takes as a particle: 上が is 上 うえ + が as often as 上がる. */
const PARTICLES = new Set('がのをにへとでやもはか')

interface Candidate { entry: number, order: number, common: boolean, stem: boolean, reading: string }

const runOf = (key: string): string => key.replace(/\P{Script=Han}+$/u, '')

/** Every pair the dictionary's words give, and what deciding between them needs. */
function collectPairs(words: Word[]): { candidates: Map<string, Candidate[]>, runReadings: Map<string, Set<string>>, nouns: Map<string, Candidate> } {
  const candidates = new Map<string, Candidate[]>()
  const runReadings = new Map<string, Set<string>>()
  const nouns = new Map<string, Candidate>()
  for (const word of words) {
    for (const run of hanRuns(word.form, parseFurigana(word.furigana)))
      getOrCreate(runReadings, run.text).add(run.spans.map(s => s.ruby).join(''))
    const split = splitWord(word.form, word.furigana)
    if (!split)
      continue
    const candidate = { entry: word.entry, order: word.order, common: word.common }
    if (!split.kana && word.common && !nouns.has(split.run))
      nouns.set(split.run, { ...candidate, stem: false, reading: split.reading })
    for (const { reading, okurigana, stem } of split.kana ? conjugate(split.kana, split.reading, word.classes) : []) {
      if (!okurigana)
        continue
      const key = split.run + okurigana
      const list = candidates.get(key) ?? []
      list.push({ ...candidate, stem, reading })
      candidates.set(key, list)
    }
  }
  return { candidates, runReadings, nouns }
}

const preferred = <T>(list: T[], test: (item: T) => boolean): T[] => list.some(test) ? list.filter(test) : list

/** Common words outrank rare ones, whole forms outrank bare stems, and within a word its first reading counts. */
function resolvePair(candidates: Candidate[]): string | null {
  const firsts = new Map<number, Candidate>()
  for (const c of preferred(preferred(candidates, c => c.common), c => !c.stem)) {
    if ((firsts.get(c.entry)?.order ?? Infinity) > c.order)
      firsts.set(c.entry, c)
  }
  const readings = new Set([...firsts.values()].map(c => c.reading))
  return readings.size === 1 ? [...readings][0]! : null
}

/** The reading of the longest shorter key that `key` starts with. */
function shorterKey(resolved: Map<string, string | null>, key: string): string | null | undefined {
  for (let end = key.length - 1; end > runOf(key).length; end--) {
    if (resolved.has(key.slice(0, end)))
      return resolved.get(key.slice(0, end))
  }
}

/**
 * Words of one kanji run and its okurigana, read as a pair: 来ない is こ, 来ます
 * is き. Keys are whole forms and their stems (読ま, 読みます), and the longest
 * key a text starts with decides. A key still read two ways is ambiguous
 * (null), and so is a noun's kanji with a particle that a verb also starts
 * with (上が). Keys that only repeat the reading of a shorter key are dropped.
 */
function compileOkurigana(words: Word[]): [key: string, reading: string | null][] {
  const { candidates, runReadings, nouns } = collectPairs(words)
  const resolved = new Map<string, string | null>()
  for (const [key, list] of candidates) {
    const run = runOf(key)
    // A run of several kanji read one way needs no pair: the font already shows that reading.
    if ([...run].length > 1 && runReadings.get(run)!.size < 2)
      continue
    const noun = nouns.get(run)
    resolved.set(key, resolvePair(noun && key.length === run.length + 1 && PARTICLES.has(key.at(-1)!) ? [...list, noun] : list))
  }
  return [...resolved]
    .filter(([key, reading]) => reading === null || shorterKey(resolved, key) !== reading)
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
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

console.log('Downloading JMdict, JMnedict, JmdictFurigana, KANJIDIC2, the JLPT lists and the Tatoeba sentences...')
const [jmdict, jmnedict, furigana, namesFurigana, kanjidic, tatoebaText, tatoebaDate, ...jlptLists] = await Promise.all([
  download(JMDICT, true),
  download(JMNEDICT, true),
  download(assetUrl('JmdictFurigana.txt')),
  download(assetUrl('JmnedictFurigana.txt')),
  download(KANJIDIC2, true),
  download(TATOEBA, true),
  download(TATOEBA_DATE),
  ...JLPT_LEVELS.map(n => download(`https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/${JLPT_VOCAB}/original_data/n${n}.csv`)),
])

const { entries, words, jlpt } = parseJmdict(jmdict, parseAlignments(furigana), parseJlpt(jlptLists))
const okurigana = compileOkurigana(words)
const tatoeba = compileTatoeba(tatoebaText, words)
const places = parseJmnedict(jmnedict, parseAlignments(namesFurigana))
const onyomi = parseKanjidic(kanjidic)
const used = new Set(entries.flatMap(([form]) => [...form]))
const sources = {
  JMdict: /JMdict created: ([\d-]+)/.exec(jmdict)?.[1] ?? 'unknown',
  JMnedict: /JMnedict created: ([\d-]+)/.exec(jmnedict)?.[1] ?? 'unknown',
  JmdictFurigana: release.tag_name,
  KANJIDIC2: /<date_of_creation>([\d-]+)</.exec(kanjidic)?.[1] ?? 'unknown',
  JLPT: `yomitan-jlpt-vocab ${JLPT_VOCAB}`,
  Tatoeba: new Date(tatoebaDate.trim()).toISOString().slice(0, 10),
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
await writeFile(OKURIGANA, formatPacked(packOkurigana(okurigana)))
await writeFile(JLPT, `[\n${jlpt.map(p => JSON.stringify(p)).join(',\n')}\n]\n`)
await writeFile(TATOEBA_OUTPUT, `[\n${tatoeba.map(p => JSON.stringify(p)).join(',\n')}\n]\n`)
console.log(`Wrote ${entries.length} entries, ${places.length} places, ${okurigana.length} okurigana pairs, ${jlpt.length} JLPT words, ${tatoeba.length} words in example sentences, ${Object.keys(onyomi).length} kanji (${JSON.stringify(sources)})`)
