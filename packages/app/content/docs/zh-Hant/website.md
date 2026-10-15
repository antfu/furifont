# 在網站上使用

Furifont 是普通的網頁字型。用 `@font-face` 載入它，設定到日語文字上，振假名就會顯示。HTML 不需要改：不用 `<ruby>` 標籤，也不用 JavaScript。

## 載入字型

從 [最新版本](https://github.com/antfu/furifont/releases/latest) 下載 `.woff2` 檔案，和網站的其他檔案放在一起。可變字型（`VF.woff2`）把所有字重放在一個檔案裡：

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
  font-display: swap;
}
```

`font-family` 中的名稱可以自己決定。其他字型家族是 `FurifontSansRomaji`、`FurifontSerif` 和 `FurifontSerifRomaji`。

每款字型包含數千個詞，所以一個可變字型大約 6 MB。請設定較長的快取時間，讓瀏覽器只下載一次。

如果不想自己架設檔案，也可以從本站載入來試用 Furifont。這些網址一律提供最新版本：

```css
@font-face {
  font-family: 'Furifont Sans';
  src: url('https://furifont.antfu.me/fonts/FurifontSansVF.woff2') format('woff2');
  font-weight: 250 900;
}
```

## 設定到文字上

```css
:lang(ja) {
  font-family: 'Furifont Sans', sans-serif;
  line-height: 1.8;
}
```

::docs-example{text="今日は日本語の勉強をします。"}
::

**給行留出空間。** 振假名畫在行內的漢字上方。如果 `line-height` 小於 1.6，一行的振假名會碰到上一行。

**保留你的拉丁字型。** 把你自己的字型放在前面。拉丁字母由它顯示，漢字和假名則由瀏覽器從 Furifont 取用：

```css
body {
  font-family: Inter, 'Furifont Sans', sans-serif;
}
```

**與其他字型對齊。** 為了給振假名留出空間，Furifont 把行的上方加高了。和圖示或其他字型放在一起時，它的文字可能會顯得稍微偏低。下面這些描述符能讓漢字位於行的中間，本站就是這樣做的：

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

### 關閉振假名

樣式集 1（`ss01`）顯示不帶振假名的漢字。在振假名礙事的地方使用它，例如標題、按鈕或表格：

```css
h1, button {
  font-feature-settings: 'ss01';
}
```

::docs-example{text="今日は日本語の勉強をします。" css="font-feature-settings: 'ss01'"}
::

如果頁面中已經有 `<ruby>` 標記，請在其中關閉 Furifont 的振假名，以免文字出現兩層振假名：

```css
ruby {
  font-feature-settings: 'ss01';
}
```

### 字重

可變字型包含從 250（ExtraLight）到 900（Heavy）的所有字重。振假名會跟著漢字的字重變化：

```css
.light { font-weight: 250; }
.heavy { font-weight: 900; }
```

::docs-example{text="日本語の勉強" css="font-weight: 250"}
::

::docs-example{text="日本語の勉強" css="font-weight: 900"}
::

### 字級

振假名是字型的一部分，所以會隨 `font-size` 縮放。其他什麼都不用改。

### 選擇讀音 {#choose-a-reading}

Furifont 顯示每個詞最常見的讀音。要顯示其他讀音，就在包住這個詞的 `<span>` 上設定 `salt`（風格替代）。`'salt' 2` 顯示讀音 2：

```html
<span style="font-feature-settings: 'salt' 2">市場</span>
```

::docs-example{text="市場"}
::

::docs-example{text="市場" css="font-feature-settings: 'salt' 2"}
::

span 必須包住整個詞，而且只包這個詞。`salt` 作用於 span 中那串漢字的第一個漢字。

`font-feature-settings` 會整個取代從父元素繼承的設定。要同時關閉振假名並選擇讀音，請把兩者寫在同一條宣告裡。

要在文字本身中選擇讀音，請使用變體選擇器。請參閱 [選擇讀音](/docs/readings)，那裡也說明了去哪裡查每個詞的讀音編號。

## 送假名

瀏覽器把漢字和假名分開排版，所以字型永遠看不到漢字後面的送假名，無法區分「来る」和「来ない」。要在這種地方顯示正確的讀音，請像上面那樣用 `salt` span 包住漢字。[書籤小工具和使用者腳本](/#any-page) 能在任何頁面上替你完成這件事。
