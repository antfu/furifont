import type { PlanGlyph } from './schema'
import { codepoints, createGlyphRegistry, createSingleLookups, glyphName } from './glyphs'
import { doubled, kanaSyllables, withMacron } from './kana'

const SOKUON = ['っ', 'ッ']
const HATSUON = ['ん', 'ン']
const CHOONPU = 'ー'

export interface KanaRomaji {
  glyphs: PlanGlyph[]
  /** The kana the rules name, ー included. */
  codepoints: number[]
  /** Digraphs such as きゃ, each drawn as one glyph. */
  digraphs: { glyph: string, components: string[] }[]
  /** A syllable to the glyph it shows before one of `next`, through `lookup`: っ doubling a consonant, ん before a vowel, a vowel ー lengthens. */
  contextual: { lookup: string, input: string, output: string, next: string[] }[]
  /** Every other kana to its romaji. */
  singles: { input: string, output: string }[]
}

/**
 * Romaji over bare kana, a syllable at a time. Only a kana run's own context
 * counts: っ before か shows k, and ー lengthens the syllable before it (コー
 * kō). Long vowels written in kana stay as written (おう ou): without the
 * word, おもう and おう look alike. `drawable` tells which text the font can
 * draw: kana of the sample text of a preview, romaji the font has.
 */
export function planKanaRomaji(drawable: (kana: string, romaji: string) => boolean): KanaRomaji {
  const registry = createGlyphRegistry((run, i) => run.spans[i]!.ruby)
  const draw = (kana: string, romaji: string): PlanGlyph => registry.run({ text: kana, spans: [{ start: 0, end: codepoints(kana).length, ruby: romaji }] })[0]!
  const syllables = kanaSyllables().filter(s => drawable(s.kana, s.romaji))
  const digraph = (kana: string): boolean => codepoints(kana).length > 1
  // What a syllable is once the digraphs formed: the context rules match it.
  const shaped = (kana: string, romaji: string): string => digraph(kana) ? draw(kana, romaji).name : glyphName(kana.codePointAt(0)!)

  const lookups = createSingleLookups('kana')
  const contextual: KanaRomaji['contextual'] = []
  const before = (kana: string, input: string, romaji: string, next: string[]): void => {
    if (!next.length || !drawable(kana, romaji))
      return
    const output = draw(kana, romaji).name
    contextual.push({ lookup: lookups.lookupFor(input, output), input, output, next })
  }
  if (drawable(CHOONPU, '')) {
    for (const { kana, romaji } of syllables) {
      const long = withMacron(romaji)
      if (long)
        before(kana, shaped(kana, romaji), long, [glyphName(CHOONPU.codePointAt(0)!)])
    }
  }
  for (const kana of SOKUON) {
    const byConsonant = Map.groupBy(syllables, s => doubled(s.romaji))
    for (const [consonant, next] of byConsonant) {
      if (consonant)
        before(kana, glyphName(kana.codePointAt(0)!), consonant, next.map(s => shaped(s.kana, s.romaji)))
    }
  }
  for (const kana of HATSUON)
    before(kana, glyphName(kana.codePointAt(0)!), 'n\'', syllables.filter(s => /^[aeiouy]/.test(s.romaji)).map(s => shaped(s.kana, s.romaji)))

  const digraphs = syllables.filter(s => digraph(s.kana)).map(s => ({ glyph: draw(s.kana, s.romaji).name, components: codepoints(s.kana).map(glyphName) }))
  const singles = syllables.filter(s => !digraph(s.kana)).map(s => ({ input: glyphName(s.kana.codePointAt(0)!), output: draw(s.kana, s.romaji).name }))
  const glyphs = registry.all()
  const named = new Set(glyphs.flatMap(g => g.bases))
  if (contextual.some(c => c.next[0] === glyphName(CHOONPU.codePointAt(0)!)))
    named.add(CHOONPU.codePointAt(0)!)
  return { glyphs, codepoints: [...named], digraphs, contextual, singles }
}
