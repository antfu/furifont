/** Hiragana U+3041..U+3096 sit exactly 0x60 below their katakana. */
const KATAKANA_OFFSET = 0x60

export function toKatakana(hiragana: string): string {
  return hiragana.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + KATAKANA_OFFSET))
}

export function toHiragana(katakana: string): string {
  return katakana.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - KATAKANA_OFFSET))
}

const VOICED: Record<string, string[]> = {
  か: ['が'],
  き: ['ぎ'],
  く: ['ぐ'],
  け: ['げ'],
  こ: ['ご'],
  さ: ['ざ'],
  し: ['じ'],
  す: ['ず'],
  せ: ['ぜ'],
  そ: ['ぞ'],
  た: ['だ'],
  ち: ['ぢ', 'じ'],
  つ: ['づ', 'ず'],
  て: ['で'],
  と: ['ど'],
  は: ['ば', 'ぱ'],
  ひ: ['び', 'ぴ'],
  ふ: ['ぶ', 'ぷ'],
  へ: ['べ', 'ぺ'],
  ほ: ['ぼ', 'ぽ'],
}

/**
 * Whether `reading` is one of the kanji's on'yomi as it surfaces inside a word:
 * as listed, with its first kana voiced (rendaku), or with a final く/き/ち/つ
 * turned into っ (sokuon), e.g. 学 ガク surfacing as がっ in 学校.
 */
export function isOnyomi(reading: string, onyomi: readonly string[]): boolean {
  return onyomi.some((on) => {
    const forms = [on, ...(VOICED[on[0]!] ?? []).map(v => v + on.slice(1))]
    if (/[くきちつ]$/.test(on))
      forms.push(...forms.map(f => `${f.slice(0, -1)}っ`))
    return forms.includes(reading)
  })
}

const ROMAJI: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'o',
  ゔ: 'vu',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ゎ: 'wa',
}

const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' }

interface Syllable {
  kana: string
  romaji: string
}

function syllables(kana: string): Syllable[] {
  const out: Syllable[] = []
  for (let i = 0; i < kana.length; i++) {
    const c = kana[i]!
    const small = YOON[kana[i + 1] ?? '']
    const base = ROMAJI[c]
    if (small && base && base.length > 1 && base.endsWith('i')) {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja
      const stem = base.slice(0, -1)
      out.push({ kana: c + kana[++i], romaji: (/(?:sh|ch|j)$/.test(stem) ? stem : `${stem}y`) + small })
    }
    else {
      out.push({ kana: c, romaji: base ?? c })
    }
  }
  return out
}

/** The consonant a っ before the romaji `next` doubles (k before ka, t before cha), or none before a vowel. */
export function doubled(next: string): string {
  if (next.startsWith('ch'))
    return 't'
  return /^[^aeiou\W]/.test(next) ? next[0]! : ''
}

/** Folds a long vowel into a macron: おう and おお give ō, うう gives ū. */
function lengthen(out: string, kana: string): string | undefined {
  if ((kana === 'う' && /[ou]$/.test(out)) || (kana === 'お' && out.endsWith('o')))
    return out.slice(0, -1) + (out.endsWith('u') ? 'ū' : 'ō')
}

/** Katakana digraphs of loanwords, in hiragana, that `syllables` does not build. */
const LOANWORD_DIGRAPHS: Record<string, string> = {
  てぃ: 'ti',
  でぃ: 'di',
  とぅ: 'tu',
  どぅ: 'du',
  てゅ: 'tyu',
  でゅ: 'dyu',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  ふゅ: 'fyu',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  ゔゅ: 'vyu',
  しぇ: 'she',
  じぇ: 'je',
  ちぇ: 'che',
  つぁ: 'tsa',
  つぃ: 'tsi',
  つぇ: 'tse',
  つぉ: 'tso',
  いぇ: 'ye',
  くぁ: 'kwa',
  ぐぁ: 'gwa',
  すぃ: 'si',
  ずぃ: 'zi',
}

/**
 * Every syllable a bare kana run is read in, hiragana and katakana: each kana
 * (but っ, whose romaji is the next consonant), the yōon digraphs (きゃ kya)
 * and, in katakana, the digraphs of loanwords (ティ ti).
 */
export function kanaSyllables(): Syllable[] {
  const singles = Object.entries({ ...ROMAJI, ん: 'n', ゕ: 'ka', ゖ: 'ke' }).map(([kana, romaji]) => ({ kana, romaji }))
  const yoon = Object.keys(ROMAJI).flatMap(c => Object.keys(YOON).map(small => syllables(c + small))).filter(s => s.length === 1).map(s => s[0]!)
  const hiragana = [...singles, ...yoon]
  const loanwords = Object.entries(LOANWORD_DIGRAPHS).map(([kana, romaji]) => ({ kana: toKatakana(kana), romaji }))
  return [...hiragana, ...hiragana.map(s => ({ ...s, kana: toKatakana(s.kana) })), ...loanwords]
}

const MACRONS: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' }

/** The syllable lengthened by ー: kō for コー. */
export function withMacron(romaji: string): string | undefined {
  const macron = MACRONS[romaji.at(-1) ?? '']
  return macron && romaji.slice(0, -1) + macron
}

/**
 * Modified Hepburn with macrons (きょう → kyō, おおきい → ōkii). `following` is
 * the kana written after this one in the word, so a trailing っ can double
 * the next consonant (学 がっ before こう → gak).
 */
export function toHepburn(kana: string, following = ''): string {
  const parts = syllables(kana)
  const after = [...parts, ...syllables(following)]
  let out = ''
  parts.forEach(({ kana: k, romaji }, i) => {
    const next = after.slice(i + 1).find(s => s.kana !== 'っ')?.romaji ?? ''
    if (k === 'っ')
      out += doubled(next)
    else if (k === 'ん')
      out += i + 1 < parts.length && /^[aeiouy]/.test(next) ? 'n\'' : 'n'
    else
      out = lengthen(out, k) ?? out + romaji
  })
  return out
}
