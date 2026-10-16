import type { Plan, PlanOptionsInput } from '../src'
import { describe, expect, it } from 'vitest'
import { createFontPlanner, fuseDictionary, resolveOptions, WORD_SOURCES } from '../src'
import { coverage, dictionary, sources } from './fixture'

/** Every source but JMdict's other words: these tests are about which words the lists select, so unranked words stay out. */
const LISTED = WORD_SOURCES.filter(s => s !== 'jmdict')
const resolve = (options: PlanOptionsInput = {}) => resolveOptions({ sources: LISTED, ...options })
const without = (source: typeof LISTED[number]) => LISTED.filter(s => s !== source)

const planFont = createFontPlanner(dictionary)
const plan = (options: PlanOptionsInput = {}, text?: string) => planFont(resolve(options), coverage, text)

/** What each glyph draws, as `bases:ruby`. */
function drawn(p: Plan): string[] {
  return p.glyphs.map(g => `${String.fromCodePoint(...g.bases)}:${g.ruby.map(r => r.text).join('|')}`)
}

function ruleIndex(p: Plan, pattern: RegExp): number {
  return p.fea.split('\n').findIndex(line => pattern.test(line))
}

describe('planner', () => {
  it('annotates common words and keeps uncommon readings out', () => {
    const { plan: p, report } = plan()
    expect(drawn(p)).toEqual(expect.arrayContaining(['日:に', '本:ほん', '今日:きょう', '今:こん', '日:にち']))
    expect(drawn(p)).not.toContain('日:じつ')
    expect(report.ivs.words['今日']).toEqual(['今日[きょう]', '今[こん]日[にち]'])
  })

  it('selects the words of the chosen sources', () => {
    expect(drawn(plan().plan)).toContain('京:きょう')
    expect(drawn(plan({ sources: ['spec'] }).plan)).toContain('京:きょう')
    expect(drawn(plan({ sources: ['spec'] }).plan)).not.toContain('学:がっ')
    expect(drawn(plan({ sources: ['ichi'] }).plan)).not.toContain('京:きょう')
  })

  it('skips the most common words whole, by score, then takes the next', () => {
    // 日本, 学校, 大学 and 人気 score 100; 今日 92; then 大人, 奉仕 and 来 87, 桜 81, 書 75 and 東京 61.
    const { plan: p, report } = plan({ skip: 4 })
    expect(drawn(p)).not.toContain('本:ほん')
    expect(drawn(p)).toEqual(expect.arrayContaining(['今日:きょう', '大人:おとな']))
    expect(report.ivs.words['今日']).toHaveLength(2)
    expect(plan({ skip: 5 }).report.ivs.words['今日']).toBeUndefined()
    expect(drawn(plan({ skip: 11 }).plan)).not.toContain('京:きょう')
    expect(plan({ take: 2 }).report.stats.patterns).toBe(2)
    expect(Object.keys(plan({ skip: 4, take: 1 }).report.ivs.words)).toEqual(['今日'])
  })

  it('selects tagged words that have no frequency bucket by their lists', () => {
    const entries = [...sources.entries, { form: '奉書', furigana: '0:ほう;1:しょ', nf: 0, priority: 'spec1', order: 0 }]
    const planner = createFontPlanner(fuseDictionary({ ...sources, entries }))
    // 東京 and 奉書; the newspaper ranking has the eight words with a bucket, not 奉書.
    expect(planner(resolve({ sources: ['spec'] }), coverage).report.stats.patterns).toBe(2)
    expect(planner(resolve({ sources: ['nf'] }), coverage).report.stats.patterns).toBe(8)
  })

  it('selects words the example sentences use often, after the tagged readings', () => {
    const planner = (uses: number) => createFontPlanner(fuseDictionary({
      ...sources,
      entries: [
        ...sources.entries.map(e => e.furigana === '0:こん;1:じつ' ? { ...e, tatoeba: uses } : e),
        { form: '本日', furigana: '0:ほん;1:じつ', nf: 0, priority: '', order: 0, tatoeba: uses },
      ],
    }))
    const often = planner(3)(resolve(), coverage)
    expect(drawn(often.plan)).toContain('日:じつ')
    expect(often.report.ivs.words['今日']).toEqual(['今日[きょう]', '今[こん]日[にち]', '今[こん]日[じつ]'])
    expect(drawn(planner(2)(resolve(), coverage).plan)).not.toContain('日:じつ')
    expect(drawn(planner(3)(resolve({ sources: without('tatoeba') }), coverage).plan)).not.toContain('日:じつ')
  })

  it('reads a lone kanji as the example sentences use it alone, given enough uses', () => {
    const planner = (kaku: number, sho: number) => createFontPlanner(fuseDictionary({
      ...sources,
      entries: sources.entries.map(e => e.form === '書く' ? { ...e, tatoeba: kaku } : e.form === '書' ? { ...e, tatoeba: sho } : e),
    }))
    const often = planner(30, 2)(resolve(), coverage).report.ivs
    expect(often.lone['書']).toBe('か')
    expect(often.kanji['書']).toEqual(['か', 'しょ'])
    expect(planner(16, 2)(resolve(), coverage).report.ivs.lone['書']).toBeUndefined()
    expect(planner(30, 20)(resolve(), coverage).report.ivs.lone['書']).toBeUndefined()
  })

  it('skips the words on the JLPT lists the reader knows', () => {
    const levels: Record<string, number> = { '今日|0-1:きょう': 5, '学校|0:がっ;1:こう': 4, '桜|0:さくら': 3 }
    const entries = sources.entries.map(e => ({ ...e, jlpt: levels[`${e.form}|${e.furigana}`] }))
    const planner = createFontPlanner(fuseDictionary({ ...sources, entries }))
    const n5 = planner(resolve({ skipJlpt: 'N5' }), coverage)
    expect(drawn(n5.plan)).not.toContain('今日:きょう')
    expect(drawn(n5.plan)).not.toContain('今:こん')
    expect(drawn(n5.plan)).toContain('学:がっ')
    expect(drawn(planner(resolve({ skipJlpt: 'N4' }), coverage).plan)).not.toContain('学:がっ')
    expect(n5.report.ivs.lone).toEqual({ 桜: 'さくら' })
    const n3 = planner(resolve({ skipJlpt: 'N3' }), coverage).report
    expect(n3.ivs.lone).toEqual({})
    expect(n3.ivs.kanji['桜']).toBeUndefined()
  })

  it('leaves a skipped word bare where a place name or a shorter word would read it', () => {
    const entries = sources.entries.map(e => e.form === '大人気' ? { ...e, jlpt: 1 } : e)
    const places = [{ form: '日本', furigana: '0:ひ;1:もと' }]
    const coverageWithPlaces = new Set([...coverage, ...[...'もと'].map(c => c.codePointAt(0)!)])
    const { plan: p, report } = createFontPlanner(fuseDictionary({ ...sources, entries, places }))(resolve({ skip: 4, skipJlpt: 'N1' }), coverageWithPlaces)
    expect(drawn(p)).not.toContain('本:もと')
    expect(report.stats.places).toBe(0)
    expect(p.fea).toContain('ignore sub uni5927\' uni4EBA\' uni6C17\';')
  })

  it('skips a lone kanji whose reading is among the most common, unless pinned', () => {
    const { report } = plan({ skip: 9 })
    expect(report.ivs.lone).toEqual({})
    expect(report.ivs.kanji['桜']).toBeUndefined()
    expect(plan({ skip: 9, words: { pin: ['桜[さくら]'] } }).report.ivs.lone).toEqual({ 桜: 'さくら' })
  })

  it('lets the user\'s words, not the curated defaults, bring a skipped word back', () => {
    const curated = createFontPlanner(fuseDictionary({ ...sources, defaults: ['今[こん]日[にち]'] }))
    expect(drawn(curated(resolve({ skip: 5 }), coverage).plan)).not.toContain('今:こん')
    expect(drawn(curated(resolve({ skip: 5, words: { add: ['今日[きょう]'] } }), coverage).plan)).toContain('今日:きょう')
  })

  it('turns lone kanji off, keeping their selector readings', () => {
    const { report } = plan({ isolated: false, words: { pin: ['書[か]'] } })
    expect(report.ivs.lone).toEqual({})
    expect(report.stats.isolated).toBe(0)
    expect(report.ivs.kanji['桜']).toEqual(['さくら'])
    expect(report.ivs.kanji['書']![0]).toBe('か')
  })

  it('protects a longer word from a shorter match that would misread it', () => {
    const { plan: p, report } = plan()
    expect(report.stats.protectedAnnotated).toBe(1)
    const longer = ruleIndex(p, /^\s*sub uni5927' lookup rb_\d+ uni4EBA' lookup rb_\d+ uni6C17' lookup rb_\d+;/)
    const shorter = ruleIndex(p, /^\s*sub uni5927' lookup lig_\d+ uni4EBA';/)
    expect(longer).toBeGreaterThan(-1)
    expect(longer).toBeLessThan(shorter)
  })

  it('leaves a run bare when it may be another word with another reading', () => {
    const entries = [...sources.entries, { form: '大人気ない', furigana: '0-1:おとな;2:げ', nf: 0, priority: 'ichi1', order: 0 }]
    // Tagged ichi1, it would be a word of its own from that list: this test is about one that is not selected.
    const { plan: p } = createFontPlanner(fuseDictionary({ ...sources, entries }))(resolve({ sources: ['nf'] }), coverage)
    expect(p.fea).toContain('ignore sub uni5927\' uni4EBA\' uni6C17\';')
  })

  it('annotates a lone kanji only when one reading dominates', () => {
    const { plan: p, report } = plan()
    expect(p.fea).toMatch(/lookup isolated useExtension \{\n {2}sub uni685C by uni685C\.rb\.1;\n\}/)
    expect(p.fea).not.toMatch(/sub uni66F8 by .* # isolated/)
    expect(report.ivs.kanji['書']).toEqual(['か', 'しょ'])
    expect(report.ivs.kanji['来']).toHaveLength(3)
    expect(report.ivs.lone).toEqual({ 桜: 'さくら' })
    expect(report.stats.isolated).toBe(1)
  })

  describe('suffixes', () => {
    /** Untagged runs of each of `prefixes` then `kanji` read `ruby`: with 学校, what makes 校 a suffix. */
    const ending = (kanji: string, ruby: string, prefixes: string) => [...prefixes].map(p => ({ form: p + kanji, furigana: `0:あ;1:${ruby}`, nf: 0, priority: '', order: 0 }))
    const withEntries = (entries: typeof sources.entries, options: PlanOptionsInput = {}) => createFontPlanner(fuseDictionary({ ...sources, entries: [...sources.entries, ...entries] }))(resolve(options), coverage)
    const NINE = '日本今大人気桜書来'

    it('reads a kanji no word claims after another kanji as it reads ending most runs', () => {
      const { plan: p, report } = withEntries(ending('校', 'こう', NINE))
      expect(report.stats.suffixes).toBe(1)
      expect(p.fea).toMatch(/lookup suffixes useExtension \{\n {2}sub uni6821 by uni6821\.rb\.\d+;\n\}/)
      expect(p.fea).toContain('sub @han [uni6821]\' lookup suffixes;')
      expect(p.fea).not.toContain('ignore sub @han [uni6821]\' @han;')
      // Before the lone-kanji rules, whose ignore rules would stop it.
      expect(ruleIndex(p, /lookup suffixes;/)).toBeLessThan(ruleIndex(p, /^\s*ignore sub @han \[/))
    })

    it('needs ten runs, nine in ten of them reading the same, and lone kanji on', () => {
      expect(withEntries(ending('校', 'こう', NINE.slice(1))).report.stats.suffixes).toBe(0)
      expect(withEntries([...ending('校', 'こう', NINE), ...ending('校', 'ご', '東京')]).report.stats.suffixes).toBe(0)
      expect(withEntries(ending('校', 'こう', NINE), { isolated: false }).report.stats.suffixes).toBe(0)
    })

    it('reads a kanji that starts more runs than it ends as a suffix only at the end of a run', () => {
      const starting = [...`${NINE}東京`].map(p => ({ form: `校${p}`, furigana: '0:こう;1:あ', nf: 0, priority: '', order: 0 }))
      expect(withEntries([...ending('校', 'こう', NINE), ...starting]).plan.fea).toContain('ignore sub @han [uni6821]\' @han;')
    })

    it('protects a run the suffix would misread', () => {
      const { plan: p } = withEntries([...ending('校', 'こう', `${NINE}東`), ...ending('校', 'げ', '京')])
      expect(p.fea).toContain('ignore sub uni4EAC\' uni6821\';')
    })
  })

  it('lets the dictionary\'s curated defaults yield to the user\'s pins', () => {
    const curated = createFontPlanner(fuseDictionary({ ...sources, defaults: ['今[こん]日[にち]'] }))
    expect(curated(resolve(), coverage).report.ivs.words['今日']![0]).toBe('今[こん]日[にち]')
    expect(curated(resolve({ words: { pin: ['今日[きょう]'] } }), coverage).report.ivs.words['今日']![0]).toBe('今日[きょう]')
  })

  it('makes the reading of a rare verb selectable without making it a default', () => {
    const { report } = plan()
    expect(report.ivs.kanji['奉']).toEqual(['ほう', 'たてまつ'])
    expect(report.stats.isolated).toBe(1)
  })

  it('reads place names where no common word claims the run', () => {
    const places = [{ form: '渋谷', furigana: '0:しぶ;1:や' }, { form: '日本', furigana: '0:ひ;1:もと' }]
    const planner = createFontPlanner(fuseDictionary({ ...sources, places }))
    const coverageWithPlaces = new Set([...coverage, ...[...'渋谷しぶやもと'].map(c => c.codePointAt(0)!)])
    const { plan: p, report } = planner(resolve(), coverageWithPlaces)
    expect(drawn(p)).toEqual(expect.arrayContaining(['渋:しぶ', '谷:や', '日:に', '本:ほん']))
    expect(drawn(p)).not.toContain('本:もと')
    expect(report.stats.places).toBe(1)
    expect(report.ivs.kanji['谷']).toBeUndefined()
    expect(drawn(planner(resolve({ sources: without('place') }), coverageWithPlaces).plan)).not.toContain('渋:しぶ')
  })

  it('applies pins and removals', () => {
    const pinned = plan({ words: { pin: ['今[こん]日[にち]', '書[か]'] } }).report
    expect(pinned.ivs.words['今日']![0]).toBe('今[こん]日[にち]')
    expect(pinned.stats.isolated).toBe(2)

    const { plan: p } = plan({ words: { remove: ['日本'] } })
    expect(drawn(p)).not.toContain('本:ほん')
    expect(p.fea).toContain('ignore sub uni65E5\' uni672C\';')
  })

  it('renders ruby in the chosen script', () => {
    expect(drawn(plan({ furiganaScript: 'hepburn' }).plan)).toEqual(expect.arrayContaining(['学:gak', '校:kō', '今日:kyō']))
    expect(drawn(plan({ furiganaScript: 'katakanaOn' }).plan)).toEqual(expect.arrayContaining(['本:ホン', '日:に', '学:ガッ', '今日:きょう']))
  })

  it('plans a preview with only what the sample text needs', () => {
    const { plan: p } = plan({}, '日本')
    expect(drawn(p).every(d => /^[日本]:/.test(d))).toBe(true)
    expect(p.subset).toEqual([...'にほん日本'].map(c => c.codePointAt(0)).sort((a, b) => a! - b!))
    expect(p.smoke).toEqual([])
  })

  it('lets salt n act as selector n after the first kanji of a run, in full builds only', () => {
    const { plan: p, report } = plan()
    expect(report.ivs.salt).toBe(true)
    // One glyph per selector, so the word rules and the kanji's own readings see the choice as they do for a selector.
    expect(p.fea).toContain(`sub uni6765 from [${report.ivs.kanji['来']!.map((_, i) => `uni6765.vs${i + 1}`).join(' ')}];`)
    // Only a kanji that starts a run keeps it: after another Han glyph, a selector glyph goes back to its kanji.
    expect(p.fea).toContain('sub uni4ECA.vs1 by uni4ECA;')
    expect(p.fea).toMatch(/sub @han \[[^\]]*uni4ECA\.vs1[^\]]*\]' lookup salt_back;/)
    expect(p.fea).toContain('feature salt {')
    const preview = plan({}, '日本')
    expect(preview.report.ivs.salt).toBe(false)
    expect(preview.plan.fea).not.toContain('salt')
  })

  it('names the glyphs its smoke checks expect', () => {
    const { plan: p } = plan()
    const names = new Set(p.glyphs.map(g => g.name))
    expect(p.smoke.length).toBeGreaterThan(2)
    expect(p.smoke.flatMap(s => s.glyphs).every(n => names.has(n))).toBe(true)
  })

  it('rejects the base font\'s reserved name', () => {
    expect(() => resolve({ family: 'Source Furigana' })).toThrow(/reserved/)
  })

  it('writes a stable feature file', () => {
    expect(plan().plan.fea).toMatchSnapshot()
  })
})
