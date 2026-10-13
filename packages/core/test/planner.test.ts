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
    expect(drawn(plan({ selectTags: [] }).plan)).not.toContain('京:きょう')
    expect(drawn(plan({ nfMax: 2 }).plan)).not.toContain('大人:おとな')
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
