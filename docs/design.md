# Furifont design

A Japanese font that shows furigana (ruby) above kanji without changing the
text. OpenType rules compiled from a dictionary choose each reading, so plain
text stays plain: copy, paste, search and selection all see the original
characters.

Reference: [Mengshen-pinyin-font](https://github.com/MaruTama/Mengshen-pinyin-font)
proved the approach for pinyin. Furifont keeps its glyph model: one glyph per
character and reading, the annotation above the em box, chosen by `rclt` chain
rules. It differs in three ways:

- The compiler appends to the base font instead of rebuilding it, so the base
  font's own features stay.
- The selectors are real variation sequences.
- The rules follow what browsers actually show a font. That last point changed
  most of the original plan; see [What the prototype changed](#what-the-prototype-changed).

## Goals

- Prebuilt fonts: **Furifont Sans** and **Furifont Serif**, Regular
  and a variable font of every weight, from Source Han Sans JP and
  Source Han Serif JP, with hiragana or Hepburn romaji ruby. Katakana for on'yomi is a build option.
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
| `@furifont/dictionary` | TS | `dict:update` compiles JMdict, JMnedict, JmdictFurigana, KANJIDIC2 and the JLPT word lists into committed JSON. It also holds a short list of curated default readings. |
| `@furifont/core` | TS | Pure: from a dictionary, options and the base font's coverage, makes the **plan** (JSON) and the feature file. It parses no fonts. |
| `@furifont/compiler` | TS | Draws the plan into the base font, compiles the rules and checks the output with HarfBuzz (harfbuzzjs, WebAssembly). Bytes in, bytes out. |
| `@furifont/helper-web` | TS | Sets any web page's Japanese text in Furifont, for the bookmarklet and the userscript: font loading, the [font stacks](#web-pages) and the okurigana spans. It also builds as one minified IIFE that both inline. |
| `furifont` | TS | The CLI (`furifont build`, `furifont dev`) and the studio's Devframe definition and RPC functions. It is the Node host: it reads and writes the files and caches the base fonts. |
| `packages/app` | Nuxt | The demo site and the studio, as one static SPA. The CLI ships it as its Devframe client. |

```
JMdict + JMnedict + JmdictFurigana + KANJIDIC2 + JLPT lists
        | dict:update (maintainers, network)
        v
packages/dictionary/data/{dictionary,places,okurigana,jlpt}.json (committed, one entry per line)
        |
        v
createFontPlanner(dictionary)(options, coverage[, previewText]) -> { plan, report }
        |                                     ^ codepoints of the base font (readFontInfo)
        v
compileFont({ plan, base, subsetWasm, version, date })  ->  font  ->  HarfBuzz smoke checks
        |
        v
toWoff2(font, brotli)
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

### Browser-safe packages

`core`, `compiler`, `dictionary` and `helper-web` MUST run in a browser as well as in Node,
so that a web studio can plan and compile without a server. They use no Node
APIs, and ESLint rejects `node:` imports in their sources.

- The compiler takes and returns bytes: `readFontInfo(font)`,
  `compileFont({ plan, base, subsetWasm, version, date })` and `toWoff2(font, brotli)`.
  The build date is an input like the rest, so the same inputs give the same bytes.
- The two things that differ by platform are passed in: `subsetWasm` loads
  harfbuzzjs' hb-subset module, which previews need, and `brotli` compresses
  WOFF2. `@furifont/compiler/node` has both for Node, with Brotli in font mode
  at quality 11. It is the one file in these packages that uses Node.
- `@furifont/compiler/browser` has both for browsers. It fetches hb-subset from
  the URL the bundler gives harfbuzzjs' file. For Brotli it uses the browser's
  own `CompressionStream('brotli')`. Where there is none, as in Chrome, it
  loads brotli-wasm, an optional peer dependency, on first use. Neither takes
  font mode or the largest window, so a full font's WOFF2 comes out about 10%
  larger: 5.21 MB instead of 4.75 MB.
- `loadDictionary()` imports its data as JSON modules. Node loads them, and
  bundlers split them into lazy chunks.
- The base fonts are fetched from `raw.githubusercontent.com`, which sends
  CORS headers. `github.com`'s redirect to it does not.

The CLI is the Node host: it reads base fonts, caches them in
`~/.cache/furifont` and writes the fonts it builds.

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

- its form has a newspaper bucket from `nfMin` (default 1) to `nfMax`
  (default 30), or
- it has a priority tag in `selectTags` (default `spec1`).

`spec1` is needed because 日本 ranks `nf25`.

A reader who knows the most common words can skip them. A run is **skipped**
whole when any of its readings ranks below `nfMin`, or is on the JLPT lists up
to `skipJlpt` (`N4` covers N5 and N4). Dropping only the known reading would
leave another one as the default: 今日 would show こんにち. Tags don't bring a
skipped word back, and neither do the curated defaults; the user's own words
do. A skipped run stays bare: no place name claims it, it gets no selectors,
and protection gives it no reading.

The JLPT levels come from Jonathan Waller's lists, which stephenmk's
yomitan-jlpt-vocab ties to JMdict entries. A level applies to the form and
reading the list writes, so 会う (N5) says nothing of 遭う.

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

A lone kanji is skipped like a word when its dominant reading is: 私 わたし
ranks `nf01` and is on the N5 list. `nfMax` doesn't limit lone kanji. With
`isolated` off, no lone kanji gets ruby, and a pinned one only orders its
readings.

The rule is class-based: no lone-kanji reading applies when a Han glyph comes
right before or after it. That includes ruby and variant glyphs.

Every kanji also gets an ordered list of its readings for the selectors: each
reading with at least 2% of the evidence, then the readings it has before
okurigana in untagged words (奉 たてまつ, for 奉る). These last ones give
selectors a reading to pick for verbs too rare to rank. A skipped lone kanji
gets no list.

### Protection

Every multi-kanji run in the full dictionary is read through the longest-match
rules. A run is **protected** when the result conflicts with any of its own
readings, as 大人気 does through 大人.

- It is annotated with its own reading when that reading is unambiguous and
  needs only readings the font already has.
- Otherwise it gets an `ignore` rule and stays bare. 大人気 is だいにんき, or
  おとなげ in 大人気ない.

Protected runs become rules themselves, so the check repeats until nothing
changes. With the default preset, about 2,400 runs are annotated and 2,300
left bare. Without place names, about 1,800 and 2,000.

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
| `alternates` | `salt` | `salt` n picks the nth reading of a kanji, before `furigana` sees it |
| `variant_readings` | `rclt` | A selector no word claimed picks the kanji's own reading |
| `variants_off` | `ccmp` | Variant glyphs left over go back to plain kanji, for example when `rclt` is off |
| `ruby_off`, `ruby_off_ligatures` | `ss01` | Ruby glyphs back to their bases |

The order of these lookups matters more than their features. Shapers apply
lookups in lookup-list order, so the fallbacks only see what `furigana` left.

The main lookup has a `subtable;` break every 600 rules, plus one before the
class rules. That lets the compiler pack it into a dozen glyph-keyed format 1
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

### Salt

A selector is a character in the text, and it shows up in copy and paste.
Markup can carry the same choice with `font-feature-settings: "salt" n`, on a
span around a run of kanji: `salt` n does what selector n (VS225 + n) does
after the run's first kanji. An alternate substitution (GSUB type 3) maps each
such kanji to its selector glyphs, and a chain rule applies it only to a kanji
that no other Han glyph precedes, so a word's second kanji is left alone. The
word rules and the kanji's own readings then see the choice as a glyph, exactly
as for a selector: 今日 with `salt` 2 is こん, にち, and 日 alone is にち. The
lookup comes before `furigana` in the lookup list. It is a full-build feature:
a preview leaves it out, and `ivs.salt` in `.ivs.json` says whether the font has
it. The compiler reads `sub X from [...]` for it.

## Web pages

The bookmarklet and the userscript set a page that is not Furifont's in
Furifont. Each element that holds Japanese, and each text field, gets
`data-furifont="n"`, and a rule in the page's adopted stylesheet puts Furifont
in front of that element's own font stack, the nth the page uses:
`font-family: "Furifont Sans", "Google Sans", Roboto, sans-serif`. The faces
Furifont adds have a `unicode-range` of kanji, kana, CJK punctuation,
full-width forms and the variation selectors. So the page's fonts keep
everything else: Latin text, and the icon fonts that draw ligatures (`search`)
or private-use code points, as on Google Maps. A stack that is monospaced, by
its generic family or by its first family's name, sets code and is left alone.

An installed Furifont needs no download: its faces come from `local()`, each
weight by its full name. Otherwise the site's variable font downloads, which
draws every weight, bold included. Of the elements Furifont sets, those with a line height under
1.6 em also get `data-furifont-tight`, which sets `line-height: normal` for the
ruby.

Each carries its own version. Once Furifont is on, the bookmarklet on each
click and the userscript once a day fetch `/version.json`, the release the site
serves. A toast links to a newer bookmarklet or userscript, and to the
downloads when the installed font is older. A page cannot read a font's tables,
so each font maps 。 and VS1 (`VERSION_PROBE` in core) to an empty glyph two
ems wide plus its revision, which the page measures on a canvas: `0.1.2` is
2.102 ems. A font from before it draws the 。 alone, an em wide at most. When
the site cannot say, as under a CSP, nothing shows.

## Okurigana pairs

A font cannot read verbs, because their okurigana is in another run. 来 is
こ in 来ない and き in 来ます. The text itself can carry that reading as a
selector, and a table of **pairs** decides it: a run of kanji with the kana
after it, read as one word. `@furifont/dictionary/okurigana` exports the table.

Writing a selector would change the text, so the bookmarklet and the
userscript use [`salt`](#salt) instead. They wrap a whole run of kanji in a
span, `<span data-furifont-salt="5">来</span>ない` or
`<span data-furifont-salt="2">一人</span>も`, which a rule in the page's adopted
stylesheet turns into `font-feature-settings: "salt" 5`. The text nodes keep
their characters. A run is read only whole, from its first kanji to the
hiragana after it: a pair of 一人 does not apply inside 毎日一人も.

The reading logic is one function, `createOkuriganaReader` in
`@furifont/helper-web`, which the bookmarklet and the userscript inline with the
rest of that package and the demo's playground imports. The playground draws the same spans in its editable text, after a
pause in typing and not during IME composition, and keeps the caret and the
undo history when nothing changes. It needs JavaScript, and that is a browser
limit: a browser shapes each script on its own, so no font can see the kana
after a kanji.

The site serves `data/okurigana.json` as it is: `dict:update` writes it packed
by run of kanji and then by reading, without losing a pair,
`{"来": {"こ": ["ない", "なかった"], "き": ["ます"], "": ["に"]}}`, where `""`
holds the okurigana that read two ways. That is a quarter fewer bytes than a
flat list, and the page only parses it: it inverts the okurigana of a run when
it first meets that run, and tries no suffix longer than that run's longest.
The page also loads the font's `.ivs.json`, to turn the
pair's reading into a number: the position in the kanji's list (`kanji`), or in
the word's (`words`). It skips a reading the font already shows by default: a
kanji's `lone`, or a word's first. When a font has no `ivs.salt`, or a file fails to load
(a CSP can block it in the bookmarklet), the page is left alone. The userscript's
menu and a switch next to the bookmarklet turn it off.

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

The longest pair a run of kanji in a text starts with decides its reading.

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

`@furifont/compiler` is TypeScript. It reads outlines, shapes and subsets with
harfbuzzjs, HarfBuzz built to WebAssembly, and compresses WOFF2 with the
Brotli it is given. It writes the tables it changes itself and copies every
other table as bytes. For a build, it does this:

1. **Load.** It loads the base font, subsetting it first for previews with
   hb-subset, keeping every layout feature and name. CFF2 variable fonts,
   WOFF, WOFF2 and collections are refused; TrueType variable fonts are
   built on, see [Variable fonts](#variable-fonts).
2. **Check the budget.** It fails if the glyphs would pass 65,535.
3. **Draw.** HarfBuzz draws the base glyphs. Each planned glyph puts the bases
   side by side and centers each ruby over its span. Points are rounded once,
   after the transform.
4. **Append the glyphs.** CFF fonts keep their charstrings and subroutines as
   bytes. New charstrings use the shortest line and curve operators, in the
   Private DICT of their first base. In CID-keyed fonts they take free CIDs,
   since a subset keeps the original ones. TrueType fonts get composite glyphs,
   which refer to their bases and ruby scaled and moved, and a long `loca`. `hmtx`, `vmtx`, `maxp`, `post` names and the
   bounding boxes grow to match. `hdmx` and `LTSH`, which list every glyph,
   are dropped.
5. **Map the variants** in `cmap` format 14, beside the font's own sequences.
   Empty format 14 subtables are dropped, because browsers reject them.
6. **Compile the features.** The compiler reads the feature file in the shape
   `emitFea` writes it, and resolves `uniXXXX` names through the base cmap, so
   a kanji glyph shared by two codepoints, such as a Kangxi radical's, needs no
   renaming. A subtable that overflows its 16-bit offsets is split by first
   glyph, which keeps every rule's meaning.
7. **Merge.** Lookups are appended to the base font's GSUB, all as Extension
   lookups; the base font's own point into its original subtables, copied
   unchanged. A feature the base font already has (such as `ccmp`) is
   extended, since a language system uses one record per tag. New features
   are registered in every language system.
8. **Finish.** The ascender is raised and names are set. Source's Reserved
   Font Name must not appear in them. The font is shaped against the plan's
   smoke checks and returned. `toWoff2` wraps it as WOFF2.

### Variable fonts

A TrueType variable font, such as Source Han's, varies its own glyphs. The new
composites follow them: a heavier kanji brings its heavier ruby. What the
composites cannot vary by themselves is where each component sits, since kana
and kanji keep their advances but Latin letters widen with the weight.

- The compiler lays each glyph out again at both ends of every axis. The
  components' moves there go into `gvar`, with a peak at -1 or 1 on that axis.
  That is exact for a two-master design such as Source Han, whose glyphs vary
  linearly between ExtraLight and Heavy.
- A component's scale cannot vary, so each ruby is squeezed as tight as its
  widest end needs.
- The bases' advances must not vary, so the new glyphs keep a fixed advance.
  In `HVAR` and `VVAR` each new glyph takes its first base's advance
  variation, which is none. Side-bearing maps, which would not cover the new
  glyphs, are dropped.
- The named instances' PostScript names are renamed after the family
  (`FurifontSansVF-Bold`), since Source Han's carry the Reserved Font Name.
  The other names describe the default instance, ExtraLight.

A full Source Han Sans JP build takes about 1.5 s, plus about 25 s for the
WOFF2. It gives 19.9 MB as OpenType and 4.7 MB as WOFF2, and uses about 41,700
of the 65,535 glyphs. Without place names, it takes 0.4 s plus 15 s and gives
7.9 MB and 3.7 MB. The steps yield to the event loop, so the studio streams
progress while it builds.

## Studio

`furifont dev` serves the app's static build together with the studio's RPC
(`furifont:state`, `report`, `preview`, `estimate`, `build`, `save`,
`search`) through Devframe's dev server.

- **Authentication.** It is gated by Devframe's one-time code. `--no-auth` is
  for trusted machines.
- **Preview.** Fonts are subsets, sent as base64 and loaded with `FontFace`.
- **Size.** After the stats and the preview, `estimate` compiles the whole
  OpenType font. Its WOFF2 would take half a minute, so Brotli at quality 8
  stands in for it, scaled by a measured ratio: within 2% from a test subset to
  full fonts with place names. Only the formats a build writes are shown.
- **Builds.** They write the formats in `formats`, OpenType, WOFF2 or both,
  stream progress, and land in `./fonts`, which the studio serves for
  download. Turning a format on or off is saved with the config, but it
  changes no plan, so it re-runs neither the preview nor the estimate.
- **Settings.** The browser keeps the changes made to the loaded config, per
  config path, until they are saved to it. A stored change that no longer
  validates drops them all. Reset returns to the loaded config but keeps the
  user's words.
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
  skipping, defaults, pins, lone kanji, protection, preview filtering, and a
  snapshot of the feature file.
- **dictionary**: the compiled data plans sensible defaults (今日 きょう,
  明日 あした, 出来 でき), reads places (新宿 しんじゅく) and pairs (来ない こ,
  下りた お, 行って null).
- **compiler**: compiles against four committed subsets of Source Han Sans
  JP: CID-keyed CFF, name-keyed CFF and TrueType without GSUB, and the
  variable TrueType font. It shapes with harfbuzzjs and checks words, protection, lone kanji, selectors, `ss01`,
  metrics, the WOFF2 and a subset preview; on the variable font, ruby at every
  weight, romaji kept centered as the letters widen, and instance names.
- **cli**: config loading, and a real `buildFont` at the size estimated.
- **e2e** (Playwright, on Chromium, Firefox and WebKit, with the font as
  WOFF2):
  - ruby differs from `ss01`;
  - VS227 differs from the default, and VS225 matches plain text;
  - selection returns the source text;
  - ruby is not clipped at `line-height: normal`;
  - wrapped lines do not overlap;
  - a variable font's ruby changes with `font-weight` and stays in its line.

  In Chromium, the studio previews, plans, estimates and builds a font, and
  keeps its settings across reloads.

## Release

A human runs `pnpm release`. It builds the packages, bumps every version, and
commits, tags and pushes the bump. Git keeps no fonts: each change to them would
add the whole files to the history, about 27 MB for the site's alone.

The tag runs `release.yml`:

- npm publishing and the changelog, through `sxzz/workflows`;
- all eight fonts, Regular as OpenType and WOFF2 and the variable
  fonts as TrueType and WOFF2, built from the tagged code and attached
  to the GitHub Release with the OFL and the data license;
- a redeploy of the site, through a Vercel deploy hook.

Each font carries the version it was released with: `0.1.2` is `head.fontRevision`
0.102 and the name `Version 0.102`, so an operating system that caches installed
fonts by version takes a new one. Its `head.modified` is the tag's commit time
(`SOURCE_DATE_EPOCH`), so the same tag builds the same bytes. A font built with
the CLI carries Furifont's version, or the config's `version`.

The site is deployed by Vercel (`vercel.json`) on every push to `main`, at
https://furifont.antfu.me. Its build compiles no font: `scripts/fetch-fonts.ts`
downloads the variable WOFF2s and their `.ivs.json` from the release of the
version in `package.json`, and the site serves them at `/fonts`. Vercel's build
of the release commit runs before CI has attached the fonts and fails, leaving
the last deploy up; the deploy hook builds it again once they are there.

The site's pages, the bookmarklet and the userscript ask for
`/fonts/<file>?v=<version>`, which the site serves as immutable: a font and its
`.ivs.json` change together, with the version. Without `?v=` a browser checks
the file on every load.

## Licensing

- **Code:** MIT.
- **Dictionary data and the rules compiled from it:** CC BY-SA 4.0 (EDRDG,
  JmdictFurigana, yomitan-jlpt-vocab after Jonathan Waller's CC BY lists).
  Each font's name table records the source versions.
- **Fonts:** SIL OFL 1.1, as derivatives of Source Han Sans and Source Han
  Serif. They carry Adobe's copyright, and none of their names contains the
  Reserved Font Name "Source".

## Known limits

- A word broken across lines is shaped as two runs, and may lose or change its
  ruby. In Chromium, `word-break: auto-phrase` keeps phrases together.
- Inflected forms of verbs with ambiguous kanji (書く, 行く, 来ない) stay
  bare, because their okurigana is in another run. Selectors can add their
  ruby, and so can `salt` on a span: the bookmarklet and the userscript do.
- A page that renders its own text nodes (a framework updating text in place)
  can overwrite or duplicate what the span wrapper split. A reader can turn the
  wrapper off.
- An okurigana pair has no context beyond its own kana: 行った stays
  ambiguous, and a noun written as kanji and kana wins over a verb's stem
  (降り is ふり, also in 降り口).
- A rare word that no common word covers, but that is spelled like a place, is
  read as the place.
- A compound missing from the dictionary is read through the words it
  contains, longest first.
- CoreText and DirectWrite are untested. Both support `cmap` format 14 and
  `rclt`, but their script itemization may differ from the browsers tested
  here.
