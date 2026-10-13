# Furifont design

A Japanese font that shows furigana (ruby) above kanji without changing the
text. OpenType rules compiled from a dictionary choose each reading, so plain
text stays plain: copy, paste, search and selection all see the original
characters.

Reference: [Mengshen-pinyin-font](https://github.com/MaruTama/Mengshen-pinyin-font)
proved the approach for pinyin. Furifont keeps its glyph model: one glyph per
character and reading, the annotation above the em box, chosen by `rclt` chain
rules. It differs in three ways:

- The toolchain is fontTools, which keeps the base font's own features.
- The selectors are real variation sequences.
- The rules follow what browsers actually show a font. That last point changed
  most of the original plan; see [What the prototype changed](#what-the-prototype-changed).

## Goals

- Prebuilt fonts: **Furifont Sans JP** Regular and Bold, from Source Han Sans
  JP, in three ruby scripts (hiragana, katakana for on'yomi, Hepburn romaji).
- A build anyone can run with another base font, word list or options.
- A local studio, served by Devframe, to tune, preview and build.
- A static demo site that loads the prebuilt fonts.
- Conservative annotation: a wrong reading is worse than no reading.

## Out of scope

- Personal names. From JMnedict, only stations and places are read.
- Ruby on kana. Only kanji are annotated.
- Vertical writing. The base font's `vert` feature is kept, but ruby glyphs
  are drawn for horizontal text only.
- Latin, digits, Chinese and Korean text, which are left as they are.

## Architecture

The repository is a pnpm monorepo. Each package has one job:

| Package | Language | Job |
| --- | --- | --- |
| `@furifont/dictionary` | TS | `dict:update` compiles JMdict, JMnedict, JmdictFurigana and KANJIDIC2 into committed JSON. It also holds a short list of curated default readings. |
| `@furifont/core` | TS | Pure: from a dictionary, options and the base font's coverage, makes the **plan** (JSON) and the feature file. It parses no fonts. |
| `@furifont/compiler` | TS + Python | A Node wrapper around `furifont.py` (fontTools). It draws the plan into the base font, compiles the rules and checks the output with HarfBuzz. |
| `@furifont/annotate` | TS | Writes the selectors that okurigana decide into a text, from the dictionary's pairs and a font's reading lists (see [Verbs](#verbs)). |
| `furifont` | TS | The CLI (`furifont build`, `furifont dev`, `furifont annotate`) and the studio's Devframe definition and RPC functions. |
| `packages/app` | Nuxt | The demo site and the studio, as one static SPA. The CLI ships it as its Devframe client. |

```
JMdict + JMnedict + JmdictFurigana + KANJIDIC2
        | dict:update (maintainers, network)
        v
packages/dictionary/data/{dictionary,places,okurigana}.json (committed, one entry per line)
        |
        v
createFontPlanner(dictionary)(options, coverage[, previewText]) -> { plan, report }
        |                                     ^ codepoints of the base font (readFontInfo)
        v
compileFont({ plan, base, output })  ->  font  ->  HarfBuzz smoke checks
```

### Layer boundary

`core` MUST NOT read font files. It receives the base font's coverage as a set
of codepoints. `compiler` MUST NOT make semantic decisions, such as which
reading to use, which words to annotate, or in what order the rules go.

The plan carries everything the compiler needs, and `PlanSchema` (valibot)
validates it before it is written. The compiler assigns real glyph names
itself: CID-keyed fonts get free CIDs. In the feature file, base characters are
named `uniXXXX`/`uXXXXX` after their codepoint.

The live preview and the full build both go through the same planner. The
preview keeps only the rules its sample text can trigger, and tells the
compiler to subset the base font first.

## What the prototype changed

The first prototype, a hand-built font with a dozen words shaped in Chromium,
Firefox and WebKit, overturned three assumptions. The real data overturned a
fourth.

1. **Fonts never see okurigana.** Browsers itemize text by Unicode script
   before shaping, and 漢字 (Han) and かな (Hiragana) are different scripts.
   A rule such as "食 followed by べ" never matches in any browser, although
   HarfBuzz matches it when given the whole string. The planned stems derived
   from parts of speech (書 + [かきくけこ]) were dropped. Rules work on **Han
   runs** instead: maximal sequences of kanji, which is all a font is ever shown.
2. **`rclt` can be turned off.** `font-feature-settings: "rclt" 0` disables it
   in all three browsers. `ss01` stays as the documented switch, because apps
   such as Word expose stylistic sets.
3. **Selectors must be variation sequences.** A kanji followed by a variation
   selector is split off its run unless the font maps that sequence in `cmap`
   format 14. A rule matching 市 + VS227 + 場 then never sees 場. Each sequence
   now maps to its own glyph (see [Selectors](#selectors)).
4. **The newspaper ranking misleads.** JMdict's `nf` buckets belong to a
   written form. Ranking by them gives 今日 こんにち and 昨日 さくじつ, the
   newspaper readings. JMdict's own order gives きょう and きのう. The ranking
   in [Defaults](#defaults) follows from this.

## Rule planning

### Words

Every dictionary entry is split into Han runs with their aligned readings. A
run whose kanji are not all annotated is dropped, and so is one whose
annotation crosses a kana. Runs of two or more kanji become **patterns** when
their entry is selected:

- its form has a newspaper bucket of at most `nfMax` (default 10), or
- it has a priority tag in `selectTags` (default `spec1`).

`spec1` is needed because 日本 ranks `nf25`.

The default preset gives about 4,800 patterns from about 6,400 forms.

### Place names

JMnedict gives about 139,000 names read as stations or places:

- a station's name, from its 駅 entry with 駅 dropped (新宿駅 gives 新宿 しんじゅく);
- otherwise a place spelled all in kanji, with exactly one reading.

With `places` (on by default), each name becomes a pattern only for a run that
no common word claims. A place name never counts as evidence for a kanji's own
reading. Places make up about 138,600 of the 143,400 patterns.

### Custom words

Custom words (`words.add`) and pins (`words.pin`) use inline notation:
`日[に]本[ほん]` for one reading per kanji, `今日[きょう]` for one reading over
several kanji. `words.remove` keeps a form bare.

### Defaults

The readings of a pattern are ranked:

1. pinned by the user;
2. curated in the dictionary;
3. carrying a priority tag;
4. JMdict order within the word itself (a run read inside a longer form ranks
   after the word's own readings);
5. corpus weight.

The curated list is short and commented. It covers words where the data
cannot tell readings apart (出来 でき, not しゅったい) and forms that drop
okurigana that running text adds back (支払 しはら, for 支払い).

### Lone kanji

A kanji alone in its run has no context at all, so it is annotated only when
one reading has at least `isolatedMinShare` (default 0.8) of the evidence. The
evidence is the best weight of any priority-tagged word in which the kanji
stands alone. 来る counts as く, き and こ equally, because its reading changes
as it conjugates. About 1,500 kanji pass, such as 桜, 駅, 私 and 見. Common verb
kanji such as 書, 行, 生 and 出 stay bare.

The rule is class-based: no lone-kanji reading applies when a Han glyph comes
right before or after it. That includes ruby and variant glyphs.

Every kanji also gets an ordered list of its readings for the selectors: each
reading with at least 2% of the evidence, then the readings it has before
okurigana in untagged words (奉 たてまつ, for 奉る). These last ones give
[Verbs](#verbs) a reading to pick for verbs too rare to rank.

### Protection

Every multi-kanji run in the full dictionary is read through the longest-match
rules. A run is **protected** when the result conflicts with any of its own
readings, as 大人気 does through 大人.

- It is annotated with its own reading when that reading is unambiguous and
  needs only readings the font already has.
- Otherwise it gets an `ignore` rule and stays bare. 大人気 is だいにんき, or
  おとなげ in 大人気ない.

Protected runs become rules themselves, so the check repeats until nothing
changes. With the default preset, about 1,750 runs are annotated and 2,200
left bare. Without place names, about 680 and 1,260.

### Glyphs

Each glyph is keyed by what it draws: one or more base characters plus ruby
spans. Every word sharing a reading therefore shares the glyph. A run whose
reading spans several kanji (今日 きょう) becomes one ligature glyph for the
whole run. Single substitutions are packed into `rb_<n>` lookups, so that each
lookup maps an input glyph only once.

### Feature file

| Lookup | Feature | Role |
| --- | --- | --- |
| `rb_*`, `lig_*`, `isolated` | (nested) | Base or variant glyph to ruby glyph |
| `furigana` | `rclt` | Chain rules, longest first per first glyph; then the lone-kanji class rules in their own subtable |
| `variant_readings` | `rclt` | A selector no word claimed picks the kanji's own reading |
| `variants_off` | `ccmp` | Variant glyphs left over go back to plain kanji, for example when `rclt` is off |
| `ruby_off`, `ruby_off_ligatures` | `ss01` | Ruby glyphs back to their bases |

The order of these lookups matters more than their features. Shapers apply
lookups in lookup-list order, so the fallbacks only see what `furigana` left.

The main lookup has a `subtable;` break every 600 rules, plus one before the
class rules. That lets fontTools pack it into a dozen glyph-keyed format 1
subtables, instead of thousands of format 3 ones that overflow 16-bit offsets.
All lookups are Extension lookups.

## Selectors

Each sequence of kanji + variation selector in VS225..VS240 is mapped in
`cmap` format 14 to an **empty placeholder glyph** with the kanji's advance.
These selectors sit at the end of the IVD range, where nothing is registered,
and Source Han Sans' own sequences use VS17 and up.

| Selector | Meaning |
| --- | --- |
| VS225 (U+E01E0) | No ruby on this kanji |
| VS226 + n (U+E01E1 + n) | Reading n + 1 |

After the first kanji of a pattern with several readings, a selector picks the
word's reading: 市 + VS227 + 場 is しじょう. After any other kanji, the
selector picks that kanji's own reading. Each kanji's readings are ordered by
evidence.

The rules always replace a placeholder: with a ruby glyph, or with the plain
kanji through `variants_off`. Placeholders therefore cost nothing in outlines.
The reading lists ship as `<font>.ivs.json`, with the reading each lone kanji
shows by default (`lone`), and on the demo's reference page.

## Verbs

A font cannot read verbs, because their okurigana is in another run. 来 is
こ in 来ない and き in 来ます. So the text gets the selectors instead, before
it reaches the font, from a table of **pairs**: a run of kanji with the kana
after it, read as one word.

`dict:update` writes the pairs to `okurigana.json` from JMdict words spelled as
one kanji run and kana (読み, 行く, 美味しい). Compounds and phrases such as
行く手 and 鼻の下が長い are left out, because there the reading belongs to the
compound.

1. **Forms.** Each verb and adjective is conjugated by its JMdict class:
   negative, polite, past, te-form, conditional, volitional, potential,
   passive, causative and the like. Its bare stems are keys too (読ま, 食べ), so
   読ませられる and 食べ物 still match.
2. **Ranking.** Common words outrank rare ones, and whole forms outrank bare
   stems (強い is つよい, not the stem of 強いる). Within a word, its first
   reading in JMdict counts (行く is いく, not ゆく).
3. **Ambiguity.** A key that still reads two ways is null: 行った (行く or
   行う), 開く (ひらく or あく). So is a noun's kanji followed by a particle that
   a verb also starts with.
4. **Size.** A key that only repeats the reading of a shorter key is dropped,
   and so is a run of several kanji with one reading everywhere, which the font
   already shows. About 37,000 pairs remain (0.9 MB, 160 KB gzipped).

`@furifont/annotate` matches the longest pair each run of kanji in a text starts
with. It writes the selector only where the font's own reading differs: the
reference's `lone` lists what each kanji alone in its run shows by default, and
`words` the default of each word. A null pair, or a reading the font cannot draw,
gets VS225 where the font would show ruby, and nothing otherwise. Existing
selectors are removed first, so annotating twice gives the same text.

`furifont annotate` reads a file or standard input. The demo's playground loads
the pairs as a chunk of its own, on first use.

## Metrics

| Option | Default | Meaning |
| --- | --- | --- |
| `rubyScale` | 0.4 | Ruby size relative to the base characters |
| `rubyGap` | 0.05 em | Space between the top of the ideographic em box and the ruby |
| `compressionFloor` | 0.6 | Ruby is squeezed horizontally down to this scale, then overhangs |
| `maxRubyWidth` | 1.6 em | The widest a ruby may get, overhanging both sides equally |

The em box comes from the BASE table's `ideo` baseline, and falls back to the
typographic ascender. `hhea.ascent` and `usWinAscent` are raised to cover the
ruby: from 1160 to 1330 for Source Han Sans JP.

Advance widths do not change, so line breaking and justification match the base
font. The default line height grows to about 1.6. A smaller `line-height`
clips the ruby. This is documented, not worked around.

Kana ruby uses the base font's own kana. Romaji uses its Latin glyphs. Source
Han Sans' `ruby` feature only covers five glyphs, so it is not used.

## Ruby scripts

| `rubyScript` | Ruby text |
| --- | --- |
| `hiragana` | The aligned reading |
| `katakanaOn` | Readings that match one of the kanji's on'yomi in KANJIDIC2, allowing rendaku and sokuon (学 がっ in 学校), in katakana; kun'yomi in hiragana |
| `hepburn` | Modified Hepburn with macrons (kyō, tōkyō), n before b/m/p (shinbun). A trailing っ doubles the next segment's consonant, so 学校 is gak + kō. |

## Compiler

`packages/compiler/python/furifont.py` needs Python 3.10 or later with
fontTools, uharfbuzz and brotli. For a build, it does this:

1. **Load.** It loads the base font, subsetting it first for previews.
2. **Check the budget.** It fails if the glyphs would pass 65,535.
3. **Draw.** Each planned glyph is drawn, with bases side by side and each ruby
   centered over its span. Drawing works for CID-keyed CFF (new glyphs reuse
   free CIDs), name-keyed CFF and TrueType outlines.
4. **Map the variants** in `cmap` format 14. Empty format 14 subtables are
   dropped, because browsers reject them.
5. **Compile the features.** feaLib compiles them against a stub glyph order
   made of logical names, then decompiles the result against the real font. A
   kanji glyph shared by two codepoints, such as Kangxi radicals, gets its
   name rewritten throughout the feature file.
6. **Merge.** The result is merged into the base font's GSUB. Lookups are
   appended. A feature the base font already has (such as `ccmp`) is
   extended, since a language system uses one record per tag. New features
   are registered in every language system.
7. **Finish.** The ascender is raised and names are set. Source's Reserved
   Font Name must not appear in them. The font is shaped against the plan's
   smoke checks, then written, with an optional WOFF2.

A full Source Han Sans JP build takes about 2.5 minutes and gives about 20 MB
as OpenType and 5.2 MB as WOFF2. It uses about 41,700 of the 65,535 glyphs.
Without place names, the build takes 35 s and gives 6.4 MB and 3.6 MB.

## Studio

`furifont dev` serves the app's static build together with the studio's RPC
(`furifont:state`, `report`, `preview`, `build`, `save`, `search`) through
Devframe's dev server.

- **Authentication.** It is gated by Devframe's one-time code. `--no-auth` is
  for trusted machines.
- **Preview.** Fonts are subsets, sent as base64 and loaded with `FontFace`.
- **Builds.** They stream progress and land in `./fonts`, which the studio
  serves for download.
- **Typed calls.** The wire contract (`StudioFunctions`) lives with the
  implementation, and the app imports it as types only.

The app's interface is in English, Japanese, Simplified Chinese and
Traditional Chinese. It follows the browser's languages (zh-TW, zh-HK and Hant
give Traditional Chinese) until the visitor picks one, which is remembered. The
fonts and the dictionary are Japanese only.

On the static demo site the studio page finds no server and explains how to
start one. Under `nuxt dev`, Devframe's Vite bridge serves the same RPC on its
own mount.

## Testing

- **core** (vitest): kana and romaji conversion, runs, notation, selection,
  defaults, pins, lone kanji, protection, preview filtering, and a snapshot of
  the feature file.
- **dictionary**: the compiled data plans sensible defaults (今日 きょう,
  明日 あした, 出来 でき), reads places (新宿 しんじゅく) and pairs (来ない こ,
  下りた お, 行って null).
- **annotate**: the pairs write the selectors for 来る, 来ない, 来ます, 奉り and
  行かない, nothing for 見る, and VS225 for 入る (はいる or いる). The compiled
  test font shapes them with their ruby.
- **compiler**: compiles against a committed Source Han Sans JP subset. It
  shapes with harfbuzzjs and checks words, protection, lone kanji, selectors,
  `ss01` and metrics.
- **cli**: config loading, and a real `buildFont`.
- **e2e** (Playwright, on Chromium, Firefox and WebKit):
  - ruby differs from `ss01`;
  - VS227 differs from the default, and VS225 matches plain text;
  - selection returns the source text;
  - ruby is not clipped at `line-height: normal`;
  - wrapped lines do not overlap.

  In Chromium, the studio previews, plans and builds a font.

## Release

Tags run `release.yml`:

- npm publishing and the changelog, through `sxzz/workflows`;
- the six fonts, built from Source Han Sans JP Regular and Bold, are attached
  to the GitHub Release with the OFL and the data license;
- the demo, with the WOFF2 fonts, is deployed to GitHub Pages under
  `/<repo>/`.

A human pushes the tag.

## Licensing

- **Code:** MIT.
- **Dictionary data and the rules compiled from it:** CC BY-SA 4.0 (EDRDG,
  JmdictFurigana). Each font's name table records the source versions.
- **Fonts:** SIL OFL 1.1, as derivatives of Source Han Sans. They carry
  Adobe's copyright, and none of their names contains the Reserved Font Name
  "Source".

## Known limits

- A word broken across lines is shaped as two runs, and may lose or change its
  ruby. In Chromium, `word-break: auto-phrase` keeps phrases together.
- In plain text, inflected forms of verbs with ambiguous kanji (書く, 行く)
  stay bare. `furifont annotate` writes their selectors, but a pair has no
  context beyond its own kana: 行った stays bare, and a noun written as kanji and
  kana wins over a verb's stem (降り is ふり, also in 降り口).
- A rare word that no common word covers, but that is spelled like a place, is
  read as the place.
- A compound missing from the dictionary is read through the words it
  contains, longest first.
- CoreText and DirectWrite are untested. Both support `cmap` format 14 and
  `rclt`, but their script itemization may differ from the browsers tested
  here.
