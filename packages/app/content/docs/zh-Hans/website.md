# 在网站上使用

Furifont 是普通的网页字体。用 `@font-face` 加载它，设置到日语文本上，振假名就会显示。HTML 不需要改：不用 `<ruby>` 标签，也不用 JavaScript。

## 加载字体

从 [最新版本](https://github.com/antfu/furifont/releases/latest) 下载 `.woff2` 文件，和网站的其他文件放在一起。可变字体（`VF.woff2`）把所有字重放在一个文件里：

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
  font-display: swap;
}
```

`font-family` 中的名称可以自己定。其他字体家族是 `FurifontSansRomaji`、`FurifontSerif` 和 `FurifontSerifRomaji`。

每款字体包含数千个词，所以一个可变字体大约 6 MB。请设置较长的缓存时间，让浏览器只下载一次。

如果不想自己托管文件，也可以从本站加载来试用 Furifont。这些网址始终提供最新版本：

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('https://furifont.antfu.me/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
}
```

## 设置到文本上

```css
:lang(ja) {
  font-family: 'Furifont Sans', sans-serif;
  line-height: 1.8;
}
```

::docs-example{text="今日は日本語の勉強をします。"}
::

**给行留出空间。** 振假名画在行内的汉字上方。如果 `line-height` 小于 1.6，一行的振假名会碰到上一行。

**保留你的拉丁字体。** 把你自己的字体放在前面。拉丁字母由它显示，汉字和假名则由浏览器从 Furifont 中取：

```css
body {
  font-family: Inter, 'Furifont Sans', sans-serif;
}
```

**与其他字体对齐。** 为了给振假名留出空间，Furifont 把行的上方加高了。和图标或其他字体放在一起时，它的文字可能会显得稍微偏低。下面这些描述符能让汉字位于行的中间，本站就是这样做的：

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

## CSS 控制

### 关闭振假名

样式集 1（`ss01`）显示不带振假名的汉字。在振假名碍事的地方使用它，例如标题、按钮或表格：

```css
h1, button {
  font-feature-settings: 'ss01';
}
```

::docs-example{text="今日は日本語の勉強をします。" css="font-feature-settings: 'ss01'"}
::

如果页面中已经有 `<ruby>` 标记，请在其中关闭 Furifont 的振假名，以免文字出现两层振假名：

```css
ruby {
  font-feature-settings: 'ss01';
}
```

### 字重

可变字体包含从 250（ExtraLight）到 900（Heavy）的所有字重。振假名会跟随汉字的字重变化：

```css
.light { font-weight: 250; }
.heavy { font-weight: 900; }
```

::docs-example{text="日本語の勉強" css="font-weight: 250"}
::

::docs-example{text="日本語の勉強" css="font-weight: 900"}
::

### 字号

振假名是字体的一部分，所以会随 `font-size` 缩放。其他什么都不用改。

### 选择读音 {#choose-a-reading}

Furifont 显示每个词最常见的读音。要显示其他读音，就在包住这个词的 `<span>` 上设置 `salt`（风格替换）。`'salt' 2` 显示读音 2：

```html
<span style="font-feature-settings: 'salt' 2">市場</span>
```

::docs-example{text="市場"}
::

::docs-example{text="市場" css="font-feature-settings: 'salt' 2"}
::

span 必须包住整个词，而且只包这个词。`salt` 作用于 span 中那串汉字的第一个汉字。

`font-feature-settings` 会整个替换从父元素继承的设置。要同时关闭振假名并选择读音，请把两者写在同一条声明里。

要在文本本身中选择读音，请使用变体选择器。请参阅 [选择读音](/docs/readings)，那里也说明了在哪里查每个词的读音编号。

## 送假名

浏览器把汉字和假名分开排版，所以字体永远看不到汉字后面的送假名，无法区分「来る」和「来ない」。要在这种地方显示正确的读音，请像上面那样用 `salt` span 包住汉字。[书签小工具和用户脚本](/#any-page) 能在任何页面上替你完成这件事。
