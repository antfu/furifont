# Choose a reading

Many words have more than one reading. 市場 can be いちば or しじょう, and 今日 can be きょう or こんにち. Furifont shows the most common reading. To show another one, put a variation selector right after the first kanji of the word.

A variation selector is an invisible character. It stays in the text, so it works in every app and on every website where the font is used, and it is kept when you copy the text.

## The selectors

| Selector | Code point | Result |
| --- | --- | --- |
| VS225 | U+E01E0 | No furigana |
| VS226 | U+E01E1 | Reading 1, the default |
| VS227 | U+E01E2 | Reading 2 |
| VS228 | U+E01E3 | Reading 3 |
| … | … | … |
| VS240 | U+E01EF | Reading 15 |

After the first kanji of a word, the selector chooses the reading of the word. After a kanji that is alone, it chooses the reading of that kanji.

::docs-example{text="市場"}
::

::docs-example{text="市\u{E01E2}場"}
::

::docs-example{text="今\u{E01E2}日"}
::

::docs-example{text="今\u{E01E0}日"}
::

## Find the reading numbers

The [reference](/reference) lists every word and kanji with more than one reading, in order. Click a reading there to copy the word with its selector.

Each release also has the lists as data: `FurifontSansVF.ivs.json` and the same file for each family.

## Type a selector

You cannot type a variation selector on a keyboard. Copy it from the [reference](/reference), or write it as an escape:

| Where | How to write 市 + VS227 + 場 |
| --- | --- |
| HTML | `市&#xE01E2;場` |
| JavaScript | `'市\u{E01E2}場'` |
| CSS `content` | `'市\E01E2場'` |

Other fonts ignore these selectors, so the text looks the same in them.

## Selector or CSS?

A selector changes the text. Search and copy see an extra character, and some tools count it. On a website, you can choose a reading with CSS instead, and the text stays as it is:

```html
<span style="font-feature-settings: 'salt' 2">市場</span>
```

`'salt' 2` does what VS227 does. See [Use on your website](/docs/website#choose-a-reading).
