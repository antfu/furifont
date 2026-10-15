# Use on your website

Furifont is a normal web font. Load it with `@font-face`, set it on your Japanese text, and the ruby shows. Your HTML does not change: no `<ruby>` tags and no JavaScript.

## Load the font

Download the `.woff2` files from the [latest release](https://github.com/antfu/furifont/releases/latest) and put them with your site's other files. The variable font (`VF.woff2`) has every weight in one file:

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
  font-display: swap;
}
```

The name in `font-family` is yours to choose. The other families are `FurifontSansRomaji`, `FurifontSerif` and `FurifontSerifRomaji`.

Each font has thousands of words, so a variable font is about 6 MB. Serve it with a long cache time, so the browser downloads it only once.

To try Furifont without hosting the files, you can load them from this site. These URLs always serve the latest release:

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('https://furifont.antfu.me/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
}
```

## Set it on your text

```css
:lang(ja) {
  font-family: 'Furifont Sans', sans-serif;
  line-height: 1.8;
}
```

::docs-example{text="今日は日本語の勉強をします。"}
::

**Give the lines room.** The ruby is drawn above the kanji, inside the line. With a `line-height` under 1.6, the ruby of one line touches the line above it.

**Keep your Latin font.** Put your own font first. It sets the Latin letters, and the browser takes the kanji and kana from Furifont:

```css
body {
  font-family: Inter, 'Furifont Sans', sans-serif;
}
```

**Align with other fonts.** Furifont makes its line taller at the top, to make room for the ruby. Next to icons or other fonts, its text can then sit a little low. These descriptors put the kanji in the middle of the line, the way this site does:

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
  ascent-override: 88%;
  descent-override: 12%;
  line-gap-override: 0%;
}
```

## CSS controls

### Turn the ruby off

Stylistic set 1 (`ss01`) shows the plain kanji. Use it where ruby gets in the way, such as headings, buttons or tables:

```css
h1, button {
  font-feature-settings: 'ss01';
}
```

::docs-example{text="今日は日本語の勉強をします。" css="font-feature-settings: 'ss01'"}
::

If your page already has `<ruby>` markup, turn Furifont's ruby off inside it, so the text does not get ruby twice:

```css
ruby {
  font-feature-settings: 'ss01';
}
```

### Weight

The variable font has every weight from 250 (ExtraLight) to 900 (Heavy). The ruby follows the weight of the kanji:

```css
.light { font-weight: 250; }
.heavy { font-weight: 900; }
```

::docs-example{text="日本語の勉強" css="font-weight: 250"}
::

::docs-example{text="日本語の勉強" css="font-weight: 900"}
::

### Size

The ruby is part of the font, so it scales with `font-size`. Nothing else needs to change.

### Choose a reading {#choose-a-reading}

Furifont shows the most common reading of each word. To show another one, set `salt` (stylistic alternates) on a `<span>` around the word. `'salt' 2` shows reading 2:

```html
<span style="font-feature-settings: 'salt' 2">市場</span>
```

::docs-example{text="市場"}
::

::docs-example{text="市場" css="font-feature-settings: 'salt' 2"}
::

The span must hold the whole word, and only that word. `salt` acts on the first kanji of the run of kanji in the span.

`font-feature-settings` replaces the whole list from the parent. To keep the ruby off and choose a reading at the same time, write both in one declaration.

To choose a reading in the text itself, use a variation selector. See [Choose a reading](/docs/readings), which also tells where to find the reading numbers of each word.

## Okurigana

A browser shapes kanji and kana apart, so the font never sees the okurigana after a kanji. It cannot tell 来る from 来ない. To show the right reading there, wrap the kanji in a `salt` span as above. The [bookmarklet and the userscript](/#any-page) do this for you on any page.
