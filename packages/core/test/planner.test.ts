import type { Plan, PlanOptionsInput } from '../src'
import { describe, expect, it } from 'vitest'
import { createFontPlanner, resolveOptions } from '../src'
import { coverage, dictionary } from './fixture'

const planFont = createFontPlanner(dictionary)
const plan = (options: PlanOptionsInput = {}, text?: string) => planFont(resolveOptions(options), coverage, text)

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

  it('selects words by frequency bucket or priority tag', () => {
    expect(drawn(plan().plan)).toContain('京:きょう')
    expect(drawn(plan({ selectTags: [], nfMax: 10 }).plan)).not.toContain('京:きょう')
    expect(drawn(plan({ nfMax: 2 }).plan)).not.toContain('大人:おとな')
  })

  it('skips the most common words whole, whatever their tags', () => {
    const { plan: p, report } = plan({ nfMin: 2, selectTags: ['ichi1', 'spec1'] })
    expect(drawn(p)).not.toContain('本:ほん')
    expect(drawn(p)).toEqual(expect.arrayContaining(['今日:きょう', '大人:おとな']))
    expect(drawn(plan({ nfMin: 26 }).plan)).not.toContain('京:きょう')
    expect(report.ivs.words['今日']).toHaveLength(2)
    expect(plan({ nfMin: 3 }).report.ivs.words['今日']).toBeUndefined()
    expect(() => resolveOptions({ nfMin: 31 })).toThrow(/nfMin/)
  })

  it('still selects tagged words that have no frequency bucket', () => {
    const entries = [...dictionary.entries, { form: '奉書', furigana: '0:ほう;1:しょ', nf: 0, priority: 'spec1', order: 0 }]
    const { plan: p } = createFontPlanner({ ...dictionary, entries })(resolveOptions({ nfMin: 48, nfMax: 48 }), coverage)
    expect(drawn(p)).toContain('書:しょ')
  })

  it('skips the words on the JLPT lists the reader knows', () => {
    const levels: Record<string, number> = { '今日|0-1:きょう': 5, '学校|0:がっ;1:こう': 4, '桜|0:さくら': 3 }
    const entries = dictionary.entries.map(e => ({ ...e, jlpt: levels[`${e.form}|${e.furigana}`] }))
    const planner = createFontPlanner({ ...dictionary, entries })
    const n5 = planner(resolveOptions({ skipJlpt: 'N5' }), coverage)
    expect(drawn(n5.plan)).not.toContain('今日:きょう')
    expect(drawn(n5.plan)).not.toContain('今:こん')
    expect(drawn(n5.plan)).toContain('学:がっ')
    expect(drawn(planner(resolveOptions({ skipJlpt: 'N4' }), coverage).plan)).not.toContain('学:がっ')
    expect(n5.report.ivs.lone).toEqual({ 桜: 'さくら' })
    const n3 = planner(resolveOptions({ skipJlpt: 'N3' }), coverage).report
    expect(n3.ivs.lone).toEqual({})
    expect(n3.ivs.kanji['桜']).toBeUndefined()
  })

  it('leaves a skipped word bare where a place name or a shorter word would read it', () => {
    const entries = dictionary.entries.map(e => e.form === '大人気' ? { ...e, jlpt: 1 } : e)
    const places = [{ form: '日本', furigana: '0:ひ;1:もと' }]
    const coverageWithPlaces = new Set([...coverage, ...[...'もと'].map(c => c.codePointAt(0)!)])
    const { plan: p, report } = createFontPlanner({ ...dictionary, entries, places })(resolveOptions({ nfMin: 2, skipJlpt: 'N1' }), coverageWithPlaces)
    expect(drawn(p)).not.toContain('本:もと')
    expect(report.stats.places).toBe(0)
    expect(p.fea).toContain('ignore sub uni5927\' uni4EBA\' uni6C17\';')
  })

  it('skips a lone kanji whose reading is among the most common, unless pinned', () => {
    const { report } = plan({ nfMin: 6 })
    expect(report.ivs.lone).toEqual({})
    expect(report.ivs.kanji['桜']).toBeUndefined()
    expect(plan({ nfMin: 6, words: { pin: ['桜[さくら]'] } }).report.ivs.lone).toEqual({ 桜: 'さくら' })
  })

  it('lets the user\'s words, not the curated defaults, bring a skipped word back', () => {
    const curated = createFontPlanner({ ...dictionary, defaults: ['今[こん]日[にち]'] })
    expect(drawn(curated(resolveOptions({ nfMin: 3 }), coverage).plan)).not.toContain('今:こん')
    expect(drawn(curated(resolveOptions({ nfMin: 3, words: { add: ['今日[きょう]'] } }), coverage).plan)).toContain('今日:きょう')
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
    const entries = [...dictionary.entries, { form: '大人気ない', furigana: '0-1:おとな;2:げ', nf: 0, priority: 'ichi1', order: 0 }]
    const { plan: p } = createFontPlanner({ ...dictionary, entries })(resolveOptions(), coverage)
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

  it('lets the dictionary\'s curated defaults yield to the user\'s pins', () => {
    const curated = createFontPlanner({ ...dictionary, defaults: ['今[こん]日[にち]'] })
    expect(curated(resolveOptions(), coverage).report.ivs.words['今日']![0]).toBe('今[こん]日[にち]')
    expect(curated(resolveOptions({ words: { pin: ['今日[きょう]'] } }), coverage).report.ivs.words['今日']![0]).toBe('今日[きょう]')
  })

  it('makes the reading of a rare verb selectable without making it a default', () => {
    const { report } = plan()
    expect(report.ivs.kanji['奉']).toEqual(['ほう', 'たてまつ'])
    expect(report.stats.isolated).toBe(1)
  })

  it('reads place names where no common word claims the run', () => {
    const places = [{ form: '渋谷', furigana: '0:しぶ;1:や' }, { form: '日本', furigana: '0:ひ;1:もと' }]
    const planner = createFontPlanner({ ...dictionary, places })
    const coverageWithPlaces = new Set([...coverage, ...[...'渋谷しぶやもと'].map(c => c.codePointAt(0)!)])
    const { plan: p, report } = planner(resolveOptions(), coverageWithPlaces)
    expect(drawn(p)).toEqual(expect.arrayContaining(['渋:しぶ', '谷:や', '日:に', '本:ほん']))
    expect(drawn(p)).not.toContain('本:もと')
    expect(report.stats.places).toBe(1)
    expect(report.ivs.kanji['谷']).toBeUndefined()
    expect(drawn(planner(resolveOptions({ places: false }), coverageWithPlaces).plan)).not.toContain('渋:しぶ')
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
    expect(drawn(plan({ rubyScript: 'hepburn' }).plan)).toEqual(expect.arrayContaining(['学:gak', '校:kō', '今日:kyō']))
    expect(drawn(plan({ rubyScript: 'katakanaOn' }).plan)).toEqual(expect.arrayContaining(['本:ホン', '日:に', '学:ガッ', '今日:きょう']))
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
    expect(() => resolveOptions({ family: 'Source Furigana' })).toThrow(/reserved/)
  })

  it('writes a stable feature file', () => {
    expect(plan().plan.fea).toMatchSnapshot()
  })
})
