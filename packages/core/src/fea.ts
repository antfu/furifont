import type { Rule } from './planner'
import type { KanaRomaji } from './romaji'

interface Substitution {
  input: string
  output: string
}

export interface FeaInput {
  /** Every Han glyph a run can contain, ruby and variant glyphs included: what makes a kanji not alone. */
  hanClass: string[]
  singles: (Substitution & { lookup: string })[]
  ligatures: { lookup: string, glyph: string, components: string[] }[]
  isolated: Substitution[]
  /** A kanji to the reading it shows after another kanji, when no word claimed it; a `final` one only at the end of a run. */
  suffixes: (Substitution & { final: boolean })[]
  rules: Rule[]
  /** Variant glyphs no rule claimed, to the kanji's own reading. */
  variantReadings: Substitution[]
  /** A kanji to its selector glyphs, in order: `salt` n is selector n after the first kanji of a run, so markup can choose a reading where the text cannot. */
  alternates: { input: string, outputs: string[] }[]
  /** Variant glyphs back to their kanji: the default when no rule picked a reading, or ruby is off. */
  variantsOff: Substitution[]
  rubyOff: { glyph: string, bases: string[] }[]
  kana: Omit<KanaRomaji, 'glyphs' | 'codepoints'>
}

/**
 * Rules per subtable of the main lookup. Breaking it up lets the compiler pack
 * each part as one glyph-keyed format 1 subtable under the 16-bit offset limit,
 * instead of thousands of format 3 subtables; order is kept across the breaks.
 */
const RULES_PER_SUBTABLE = 600

function block(keyword: 'lookup' | 'feature', name: string, body: string[]): string {
  // Extension lookups take 32-bit offsets: ours can be large, and sit after the base font's.
  const flags = keyword === 'lookup' ? ' useExtension' : ''
  return `${keyword} ${name}${flags} {\n${body.map(l => `  ${l}`).join('\n')}\n} ${name};\n`
}

/** A lookup of single substitutions, or none when there are none. */
function singleLookup(name: string, substitutions: Substitution[]): string[] {
  return substitutions.length ? [block('lookup', name, substitutions.map(s => `sub ${s.input} by ${s.output};`))] : []
}

function chainRule(rule: Rule): string {
  if (rule.ignore)
    return `ignore sub ${rule.input.map(g => `${g}'`).join(' ')};`
  return `sub ${rule.input.map((g, i) => `${g}'${rule.lookups[i] ? ` lookup ${rule.lookups[i]}` : ''}`).join(' ')};`
}

const glyphClass = (substitutions: Substitution[]): string => `[${substitutions.map(s => s.input).join(' ')}]`

/** Romaji over kana, after the kanji's lookups, which never see a kana: the digraphs, then the syllables context changes, then the rest. */
function kanaLookups({ digraphs, contextual, singles }: FeaInput['kana']): { lookups: string[], rclt: string[] } {
  const lookups: string[] = []
  for (const [lookup, subs] of Map.groupBy(contextual, c => c.lookup))
    lookups.push(block('lookup', lookup, subs.map(s => `sub ${s.input} by ${s.output};`)))
  const rclt: string[] = []
  if (digraphs.length) {
    lookups.push(block('lookup', 'kana_digraphs', digraphs.map(d => `sub ${d.components.join(' ')} by ${d.glyph};`)))
    rclt.push('lookup kana_digraphs;')
  }
  if (contextual.length) {
    // Rules of one glyph after another first, which the compiler packs glyph-keyed; then those of a class.
    const glyphs = contextual.filter(c => c.next.length === 1)
    const classes = contextual.filter(c => c.next.length > 1)
    const rule = (c: FeaInput['kana']['contextual'][number]): string => `sub ${c.input}' lookup ${c.lookup} ${c.next.length > 1 ? `[${c.next.join(' ')}]` : c.next[0]};`
    lookups.push(block('lookup', 'kana_context', [...glyphs.map(rule), ...glyphs.length && classes.length ? ['subtable;'] : [], ...classes.map(rule)]))
    rclt.push('lookup kana_context;')
  }
  if (singles.length) {
    lookups.push(...singleLookup('kana', singles))
    rclt.push('lookup kana;')
  }
  return { lookups, rclt }
}

/** The chain rules, longest first, then the suffix and lone-kanji class rules. */
function mainRules(input: FeaInput): string[] {
  const words = input.rules.flatMap((rule, i) => i && i % RULES_PER_SUBTABLE === 0 ? ['subtable;', chainRule(rule)] : [chainRule(rule)])
  const classes: string[] = []
  // Before the lone-kanji rules, whose ignore rules would stop a suffix after a kanji.
  const final = input.suffixes.filter(s => s.final)
  if (final.length)
    classes.push(`ignore sub @han ${glyphClass(final)}' @han;`)
  if (input.suffixes.length)
    classes.push(`sub @han ${glyphClass(input.suffixes)}' lookup suffixes;`)
  if (input.isolated.length) {
    const kanji = glyphClass(input.isolated)
    classes.push(`ignore sub @han ${kanji}';`, `ignore sub ${kanji}' @han;`, `sub ${kanji}' lookup isolated;`)
  }
  // Class-based rules get a subtable of their own, or none of the above could be
  // glyph-keyed; a break before the first rule would only open an empty one.
  return [...words, ...words.length && classes.length ? ['subtable;'] : [], ...classes]
}

/**
 * Writes the feature file. Nested lookups come first so the main one can call
 * them; the fallbacks come after it, in lookup order, so they only see what it
 * left: `ccmp` turns unclaimed variant glyphs back into kanji, `ss01` undoes ruby.
 */
export function emitFea(input: FeaInput): string {
  const out = ['languagesystem DFLT dflt;\n']
  if (input.hanClass.length)
    out.push(`@han = [${input.hanClass.join(' ')}];\n`)

  const bySlot = Map.groupBy(input.singles, s => s.lookup)
  for (const [lookup, singles] of [...bySlot].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })))
    out.push(block('lookup', lookup, singles.map(s => `sub ${s.input} by ${s.output};`)))
  const byLigatureSlot = Map.groupBy(input.ligatures, l => l.lookup)
  for (const [lookup, ligatures] of [...byLigatureSlot].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })))
    out.push(block('lookup', lookup, ligatures.map(l => `sub ${l.components.join(' ')} by ${l.glyph};`)))
  out.push(...singleLookup('isolated', input.isolated), ...singleLookup('suffixes', input.suffixes))

  // Before `furigana`, which sees the selector `salt` picked. Every glyph takes it, then all but the run's first go back. Keep the alternates a lookup of the feature itself: CoreText gives a nested one alternate 1 whatever the value.
  const salt = { lookup: [] as string[], feature: [] as string[] }
  if (input.alternates.length) {
    const selectors = `[${input.alternates.flatMap(a => a.outputs).join(' ')}]`
    salt.lookup = [
      block('lookup', 'alternates', input.alternates.map(a => `sub ${a.input} from [${a.outputs.join(' ')}];`)),
      block('lookup', 'salt_back', input.alternates.flatMap(a => a.outputs.map(o => `sub ${o} by ${a.input};`))),
      block('lookup', 'salt_first', [`sub @han ${selectors}' lookup salt_back;`]),
    ]
    salt.feature = [block('feature', 'salt', ['lookup alternates;', 'lookup salt_first;'])]
  }
  out.push(...salt.lookup)
  const main = mainRules(input)
  if (main.length)
    out.push(block('lookup', 'furigana', main))
  out.push(...singleLookup('variant_readings', input.variantReadings), ...singleLookup('variants_off', input.variantsOff))
  const kana = kanaLookups(input.kana)
  out.push(...kana.lookups)

  const singles = input.rubyOff.filter(r => r.bases.length === 1)
  const ligatures = input.rubyOff.filter(r => r.bases.length > 1)
  const off: string[] = []
  if (singles.length) {
    out.push(block('lookup', 'ruby_off', singles.map(r => `sub ${r.glyph} by ${r.bases[0]};`)))
    off.push('lookup ruby_off;')
  }
  if (ligatures.length) {
    out.push(block('lookup', 'ruby_off_ligatures', ligatures.map(r => `sub ${r.glyph} by ${r.bases.join(' ')};`)))
    off.push('lookup ruby_off_ligatures;')
  }
  const rclt = [main.length && 'lookup furigana;', input.variantReadings.length && 'lookup variant_readings;', ...kana.rclt].filter(l => typeof l === 'string')
  if (rclt.length)
    out.push(block('feature', 'rclt', rclt))
  if (input.variantsOff.length)
    out.push(block('feature', 'ccmp', ['lookup variants_off;']))
  if (off.length)
    out.push(block('feature', 'ss01', off))
  out.push(...salt.feature)
  return out.join('\n')
}
