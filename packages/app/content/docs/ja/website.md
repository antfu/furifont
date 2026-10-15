# ウェブサイトで使う

Furifont は普通のウェブフォントです。`@font-face` で読み込み、日本語の文章に指定すれば、ふりがなが表示されます。HTML は変えません。`<ruby>` タグも JavaScript も要りません。

## フォントを読み込む

[最新のリリース](https://github.com/antfu/furifont/releases/latest) から `.woff2` ファイルをダウンロードし、サイトのほかのファイルと一緒に置きます。バリアブルフォント（`VF.woff2`）なら、一つのファイルにすべての太さが入っています。

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
  font-display: swap;
}
```

`font-family` の名前は自由に決められます。ほかのファミリーは `FurifontSansRomaji`、`FurifontSerif`、`FurifontSerifRomaji` です。

フォントには数千の言葉が入っているので、バリアブルフォントは約 6 MB あります。ブラウザが一度だけダウンロードするように、長いキャッシュ期間で配信してください。

ファイルを自分で置かずに Furifont を試すなら、このサイトから読み込めます。この URL は常に最新のリリースを配信します。

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('https://furifont.antfu.me/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
}
```

## 文章に指定する

```css
:lang(ja) {
  font-family: 'Furifont Sans', sans-serif;
  line-height: 1.8;
}
```

::docs-example{text="今日は日本語の勉強をします。"}
::

**行に余裕を持たせる。** ふりがなは、行の中で漢字の上に描かれます。`line-height` が 1.6 より小さいと、ある行のふりがなが上の行に触れます。

**欧文フォントはそのまま使う。** 自分のフォントを先に書きます。欧文はそのフォントで表示され、漢字とかなは Furifont から取られます。

```css
body {
  font-family: Inter, 'Furifont Sans', sans-serif;
}
```

**ほかのフォントと揃える。** Furifont は、ふりがなの場所を作るために、行の上側を高くしています。そのため、アイコンやほかのフォントと並べると、文字が少し下がって見えることがあります。次の記述子を使うと、このサイトと同じように、漢字が行の真ん中に来ます。

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

## CSS での設定

### ふりがなを消す

スタイルセット 1（`ss01`）は、ふりがなのない漢字を表示します。見出し、ボタン、表など、ふりがなが邪魔になるところで使います。

```css
h1, button {
  font-feature-settings: 'ss01';
}
```

::docs-example{text="今日は日本語の勉強をします。" css="font-feature-settings: 'ss01'"}
::

ページにすでに `<ruby>` のマークアップがあるなら、その中では Furifont のふりがなを消して、ふりがなが二重に付かないようにします。

```css
ruby {
  font-feature-settings: 'ss01';
}
```

### 太さ

バリアブルフォントには、250（ExtraLight）から 900（Heavy）までのすべての太さがあります。ふりがなは漢字の太さに合わせて変わります。

```css
.light { font-weight: 250; }
.heavy { font-weight: 900; }
```

::docs-example{text="日本語の勉強" css="font-weight: 250"}
::

::docs-example{text="日本語の勉強" css="font-weight: 900"}
::

### 大きさ

ふりがなはフォントの一部なので、`font-size` に合わせて大きさが変わります。ほかに変えるものはありません。

### 読みを選ぶ {#choose-a-reading}

Furifont は、それぞれの言葉の一番よく使う読みを表示します。別の読みにするには、言葉を囲む `<span>` に `salt`（スタイリスティック代替）を指定します。`'salt' 2` で読み 2 になります。

```html
<span style="font-feature-settings: 'salt' 2">市場</span>
```

::docs-example{text="市場"}
::

::docs-example{text="市場" css="font-feature-settings: 'salt' 2"}
::

span には言葉全体を、その言葉だけを入れます。`salt` は、span の中の漢字の並びの最初の漢字に働きます。

`font-feature-settings` は、親から受け継いだ指定をまるごと置き換えます。ふりがなを消しながら読みも選ぶには、一つの宣言に両方を書きます。

文章の中で読みを選ぶには、異体字セレクタを使います。[読みを選ぶ](/docs/readings) を見てください。それぞれの言葉の読みの番号を調べる方法も書いてあります。

## 送り仮名

ブラウザは漢字とかなを別々に字形処理するので、フォントには漢字の後ろの送り仮名が見えません。「来る」と「来ない」を見分けられません。そこで正しい読みを表示するには、上のように漢字を `salt` の span で囲みます。[ブックマークレットとユーザースクリプト](/#any-page) を使えば、どのページでもこれを自動で行います。
