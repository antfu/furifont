# Furifont design

A Japanese font that shows furigana (ruby) above kanji without changing the
underlying text. The reading is chosen by OpenType contextual rules compiled
from a dictionary, so plain text stays plain: copy, paste, search and
selection all see the original characters.

Reference: [Mengshen-pinyin-font](https://github.com/MaruTama/Mengshen-pinyin-font)
proves the approach for pinyin. We borrow its glyph model (one composite glyph
per character-reading pair, placed above the em box, selected by `rclt` chain
rules) and avoid its toolchain limits (otfcc corrupting large tables, wiping
the base GSUB, 65k glyph ceiling).

## Goals

- Prebuilt fonts for download: **Furifont Sans JP** Regular and Bold, built
  from Source Han Sans JP, in three ruby scripts (hiragana, katakana for
  on'yomi, Hepburn romaji).
- A build pipeline anyone can run against a different base font or
  dictionary.
- A local dashboard (Devframe) to customise the dictionary and ruby options,
  preview, and build.
- A static demo site that loads the prebuilt fonts.
- Conservative annotation: a wrong reading is worse than no reading.

## Out of scope for v1

- Proper nouns (JMnedict).
- Ruby on kana words; only kanji are annotated.
- Vertical writing. The base font's `vert` feature is kept, but ruby glyphs
  are designed for horizontal text only.
- Kanji not in the selected dictionary. No "most common reading of this
  character" fallback except the single-reading rule below.
- Latin, digits, Chinese and Korean text are untouched.

## Architecture

pnpm monorepo. Packages and their one job each:

| Package                 | Language | Job                                                                                          |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `@furifont/dictionary`  | TS       | `dict:update` pipeline from JMdict + JmdictFurigana + KANJIDIC2 to a committed compact JSON. |
| `@furifont/core`        | TS       | Pure: dictionary + options -> **build plan** (JSON) + `.fea` text. No font parsing.          |
| `@furifont/compiler`    | TS + Py  | Node wrapper that runs `compile.py` (fontTools): plan + base font -> font file.              |
| `@furifont/dashboard`   | TS/Vue   | Devframe definition (RPC functions) + client SPA (Vue 3, UnoCSS).                            |
| `furifont`              | TS       | CLI: `furifont build`, `furifont dev` (opens the dashboard).                                 |
| `playground`            | TS/Vue   | Static demo site deployed to GitHub Pages.                                                   |

Data flow:

```
JMdict + JmdictFurigana + KANJIDIC2
        | dict:update (network, run by maintainers)
        v
packages/dictionary/data/*.json  (committed)
        |
        v
core.plan(dictionary, options)  ->  plan.json + rules.fea
        |
        v
compiler (python3 compile.py --plan plan.json --base SourceHanSansJP-Regular.otf --out Furifont-Regular.otf)
        |
        v
font file  ->  harfbuzzjs tests, Playwright tests, release assets, demo
```

### Layer boundary (invariant)

`core` MUST NOT read font files. `compiler` MUST NOT make semantic decisions
(which reading, which words, rule order). Everything the compiler needs is in
the plan. The plan is the contract between the two and is validated with a
schema on the TS side before it is written.

This keeps `core` unit-testable without fonts, and lets the compiler be
replaced (a TS or Pyodide compiler later) without touching the planner. It is
also why the dashboard preview and the full build are guaranteed to agree:
both call the same `plan()`.

## Glyph model

### Pair glyphs

For each kanji `K` and reading `r` the planner emits one composite glyph,
named `uniXXXX.rb.N` where `N` is the reading's index in that kanji's ordered
reading list (index 1 = default). The compiler builds it from the unchanged
kanji outline plus the ruby outlines (kana or Latin, taken from the base font)
scaled and positioned above the em box.

### Word ligature glyphs

Readings that cannot be split per character (jukujikun: 今日 -> きょう,
大人 -> おとな) become one ligature glyph spanning the whole word, named
`uniXXXX_uniYYYY.rb.N`, with the ruby distributed across the word's width.
Ligatures break per-character caret placement inside that word in some
renderers; this is accepted for the few hundred such words.

### Budget

Source Han Sans JP has about 20k glyphs. The nf01..nf10 preset yields on the
order of 3-6k pair glyphs and a few hundred ligatures. The compiler MUST fail
with a clear message if the total would exceed 65,535.

## Metrics and layout

Defaults, all overridable in `options.metrics`:

| Option             | Default | Meaning                                                                                      |
| ------------------ | ------- | -------------------------------------------------------------------------------------------- |
| `rubyScale`        | 0.5     | Ruby glyphs are scaled to 50% of the base em, print convention.                              |
| `rubyGap`          | 0.05 em | Gap between the kanji's top (em box top) and the ruby baseline area.                         |
| `ascenderRaise`    | 0.5 em  | `hhea.ascender`, `OS/2.sTypoAscender`, `usWinAscent` and `head.yMax` are raised by this.     |
| `compressionFloor` | 0.6     | Ruby is squeezed horizontally down to this x-scale to fit the base advance.                  |
| `maxRubyWidth`     | 1.6 em  | Past the floor, ruby overhangs symmetrically beyond the advance width, up to this total.     |

The base kanji is never shrunk and advance widths are unchanged, so line
breaking and justification are identical to the base font. Default line height
grows to about 1.6x the font size; a CSS `line-height` below ~1.5 clips the
ruby. This is documented, not worked around.

No collision avoidance between two adjacent overhanging rubies in v1. Both
neighbours must have 4+ mora readings for this to happen.

## Rule planning

Input: the compiled dictionary and `options`. Output: the plan.

### 1. Select words

Entries containing at least one kanji whose best priority bucket is within
`options.nfMax` (default 10, i.e. nf01..nf10), plus single-kanji entries tagged
`ichi1` that have exactly one reading. Custom words (`options.words.add`,
`options.words.remove`, `options.words.pin`) are applied last. Custom readings
are written with inline alignment: `日[に]本[ほん]`.

### 2. Expand inflections

From JMdict part-of-speech tags:

| POS         | Pattern emitted                                                   |
| ----------- | ----------------------------------------------------------------- |
| `v1`        | stem without final る, followed by any kana                       |
| `v5k`..`v5u`| stem, followed by one kana from the row class (書 + [かきくけこい]) |
| `adj-i`     | stem, followed by one of [いくかけさ]                              |
| `vs` nouns  | the noun only                                                     |
| others      | dictionary form verbatim                                          |

Only kanji are substituted; okurigana stay as they are and act as context.

### 3. Resolve ambiguity

Group patterns by their kanji sequence. If a sequence has one reading, use it.
If it has several, the default is the one with the best nf bucket, then the
best priority tag, then the order JMdict lists them. All other readings become
alternates reachable through IVS (below). `options.words.pin` overrides the
default for a word.

### 4. Order and protect

Rules are sorted longest kanji sequence first. Then every selected pattern is
checked against the **full** dictionary, not just the selected subset: if a
longer dictionary word contains the pattern and reads those kanji differently
(一日 inside 一日中, 生 inside 生活 vs 生きる), a protective rule for the longer
sequence is emitted before it, either annotating it (if its reading is
unambiguous) or leaving it bare (an empty-substitution "ignore" rule).

### 5. Emit

The planner writes:

- the glyph list (pair glyphs, ligature glyphs, with ruby text already
  converted to the target script);
- `rules.fea`: glyph classes, one `rclt` chain-context lookup whose rules
  dispatch to single-substitution lookups (one per kanji) and ligature lookups;
  a `ss01` lookup mapping every ruby glyph back to its bare glyph;
- the IVS table;
- the metrics options.

Because a chain rule substitutes every kanji in the word in one step and the
shaper then advances past the whole match, a kanji already substituted cannot
be re-matched by a shorter rule.

## OpenType features

- Rules live under **`rclt`** (required contextual alternates) for `DFLT`,
  `kana` and `hani` scripts. Applications cannot turn `rclt` off, which is the
  point: the font annotates by default.
- The base font's GSUB and GPOS are kept intact; our lookups are appended with
  fontTools `feaLib` (`addOpenTypeFeatures` with the existing tables merged).
- **`ss01` = ruby off.** One lookup, placed after ours, maps all ruby glyphs to
  the bare glyph, so `font-feature-settings: "ss01"` shows the plain font.
- Large lookups are compiled with fontTools' automatic overflow handling
  (Extension lookups). The compiler MUST run `fontTools.ttLib` round-trip
  validation and a HarfBuzz smoke shape before writing the output.

## IVS overrides

Users who need a different reading, or no ruby, insert a Unicode variation
selector after a kanji. Plain text stays plain; the selector is invisible and
survives copy and paste.

Source Han Sans already uses U+E0100.. for registered IVD glyph variants, so we
use the tail of the range, where the IVD has no registrations:

| Selector            | Meaning                                                              |
| ------------------- | -------------------------------------------------------------------- |
| U+E01E0 (VS225)     | Suppress ruby on this character.                                     |
| U+E01E1 (VS226)     | Reading 1 of this character (the default; useful to force it).       |
| U+E01E2.. (VS227..) | Alternate readings 2.. in the character's ordered list.              |

When the selector follows the **first kanji of an ambiguous dictionary word**
(市 U+E01E2 場), the rule matches the word with the selector and applies that
word's reading N to the whole word (いちば). Otherwise the selector applies to
the single character.

Implementation: the selector code points are mapped to real zero-width glyphs
in `cmap` (not `cmap` format 14 UVS, because UVS cannot drive contextual
rules), the chain rules include them as context, and a final lookup deletes
them. The build emits `ivs.json` (kanji -> ordered readings) and the demo
renders it as a reference page.

## Dictionary pipeline

Sources, all CC BY-SA 4.0 (EDRDG / Doublevil):

- **JMdict** (words, readings, part of speech, priority tags, nf buckets).
- **JmdictFurigana** (per-kanji alignment of each JMdict word's reading).
- **KANJIDIC2** (on/kun reading lists per kanji, for the katakana variant).

`pnpm --filter @furifont/dictionary dict:update` downloads the three, merges
them, and writes `packages/dictionary/data/words.json` plus
`kanji.json`. The output records source versions and dates. The JSON is
committed and published, so builds and the dashboard work offline and
dictionary changes show up as reviewable diffs.

Compact record per word:

```json
{ "k": "日本", "r": ["に", "ほん"], "on": [true, true], "pos": ["n"], "nf": 1, "pri": ["ichi1", "news1"] }
```

A word-level reading that cannot be aligned (`r` spanning the whole kanji
sequence) is a ligature candidate.

## Ruby scripts

`options.rubyScript`:

| Value        | Ruby text                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `hiragana`   | Reading as aligned (default).                                                                            |
| `katakanaOn` | Readings flagged on'yomi (matched against KANJIDIC2 on list, allowing rendaku and sokuon) in katakana.   |
| `hepburn`    | Modified Hepburn: macrons for long vowels (きょう -> kyō), ん before b/m/p stays n (shinbun), っ doubles. |

Latin ruby uses the base font's own Latin glyphs so style and license match.

Prebuilt families: `Furifont Sans JP`, `Furifont Sans JP Kata`,
`Furifont Sans JP Romaji`, each Regular and Bold. Source Han Sans is OFL with
the reserved name "Source", so none of our names contain it.

## Compiler

`packages/compiler/compile.py`, Python 3.11+, fontTools only. Steps:

1. Load plan, validate glyph count against the base font.
2. For each pair/ligature glyph: measure the ruby glyphs' advances, scale by
   `rubyScale`, compress to fit (down to the floor), centre over the base
   advance, allow overhang up to `maxRubyWidth`, draw with a transform pen into
   a new CFF charstring (or glyf composite for TrueType bases).
3. Add `cmap` entries for the selector glyphs.
4. Compile `rules.fea` against the existing GSUB with feaLib.
5. Raise vertical metrics; set family, style and version names from the plan.
6. Save, reload, shape a smoke string with uharfbuzz, exit non-zero on
   mismatch.

The Node wrapper locates `python3`, checks `import fontTools`, and prints
`pip install fonttools uharfbuzz` if missing. It does not install anything.

## CLI and dashboard

`furifont build --base <font> [--dictionary <json>] [--preset nf10] [--ruby-script hiragana] [--out dir]`
runs plan + compile. `furifont dev` starts the Devframe dev server with the
dashboard.

Dashboard (Devframe `defineDevframe` + `defineRpcFunction`, Vue 3 + UnoCSS
client):

- Base font: pick a local file or download a Source Han Sans JP weight.
- Dictionary: nf cutoff slider, ichi1/news1 toggles, search, add/remove/pin
  words with aligned readings, see which words are ambiguous and what default
  was chosen.
- Ruby: script, scale, compression floor, max width, ascender raise.
- Preview: a textarea; on change the server plans and compiles a font
  containing only the glyphs needed for that text (seconds), streams it back,
  and the client loads it with `FontFace`.
- Build: full build with streamed progress and download link.

Preview and full build share `plan()`; the preview only filters the glyph list
and rules to the sample text.

## Demo and release

- `playground` is a static Vite + Vue site on GitHub Pages: type text, switch
  family and script, toggle `ss01`, view the IVS reference table.
- CI (`release.yml`) on tag: set up Node and Python, `pip install fonttools
  uharfbuzz`, download Source Han Sans JP Regular/Bold OTFs from Adobe's
  release, build all six fonts, run the test suites, attach the fonts to the
  GitHub Release, publish the npm packages, deploy the demo with the fonts
  built in that run.
- Releases are triggered by a human. No agent releases autonomously.

## Testing

- `core`: vitest unit tests on selection, inflection expansion, ambiguity
  resolution, ordering and conflict protection; snapshot of generated `.fea`
  for a fixed fixture dictionary.
- `compiler`: harfbuzzjs (HarfBuzz as wasm, no system dependency) shapes
  strings with the built font and asserts glyph names: 日本 -> `uni65E5.rb.1
  uni672C.rb.1`, 市場 defaults, 市 U+E01E2 場 selects the alternate, `ss01`
  restores bare glyphs, longer words win.
- Browser: Playwright on Chromium, Firefox and WebKit: screenshot comparison,
  line-height clipping, wrapping inside annotated words, selection highlight
  covers the whole glyph, copy/paste returns the original text.
- Gates before every PR: `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`.

## Licensing

- Tooling (all TS and Python code): MIT.
- Dictionary data and generated rule data: CC BY-SA 4.0, with attribution to
  EDRDG (JMdict, KANJIDIC2) and JmdictFurigana. Source versions are recorded in
  the compiled JSON and in the font's `name` table description.
- Font outlines: SIL OFL 1.1, as Source Han Sans. The released fonts carry the
  OFL, a note that the embedded reading rules derive from CC BY-SA data, and no
  reserved name.

## Milestones

Each milestone is one PR.

- **M0 Scaffold**: packages above, workspace gates, CI with Python set up,
  README.
- **M1 Prototype**: ~30 hand-listed words, pair glyphs + one ligature, `rclt`
  rules and `ss01`, on Source Han Sans JP Regular; harfbuzzjs assertions and
  Playwright screenshots in three browsers. Answers the rendering questions
  before any dictionary work.
- **M2 Dictionary**: `dict:update`, compiled JSON, presets, POS stems, on/kun
  flags.
- **M3 Planner and compiler**: longest-match ordering, full-dictionary
  conflict check, IVS, kata/romaji scripts, overflow handling, glyph budget.
- **M4 CLI and dashboard**: `furifont build`, `furifont dev`, subset preview,
  full build, custom words.
- **M5 Release**: demo site, release workflow, prebuilt fonts, docs.

## Risks

| Risk                                                                 | Mitigation                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Thousands of chain-context subtables overflow 16-bit offsets.        | fontTools Extension lookups; group rules by kanji class; M1 measures real sizes early.                |
| Wrong default reading for an ambiguous word.                         | nf-based choice, dashboard shows every ambiguous word, IVS override, `pin`.                           |
| Pattern matches inside an unlisted longer compound.                  | Full-dictionary protection rules; unknown compounds remain a known limitation, documented.            |
| Ruby overhang collides with a neighbour.                             | Rare by construction (two adjacent 4+ mora readings); option to lower `maxRubyWidth`.                 |
| Word or an app ignores `rclt`.                                       | Documented; Word applies features once any OpenType option is enabled, as Mengshen found.             |
| Shapers treat variation selectors as default-ignorable and skip them in context matching. | M1 verifies the selector-as-glyph approach in HarfBuzz, CoreText and DirectWrite before M3 builds on it; fallback is `cmap` format 14 for per-character selection only. |
| CC BY-SA data inside an OFL font confuses users.                     | Clear LICENSE split in release assets and README.                                                     |
