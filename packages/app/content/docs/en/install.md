# Install the font

Install Furifont on your computer to use it in any app that lets you choose a font: word processors, design tools, slides, notes, and the browser.

## Choose a file

Get the fonts from the [Download](/#downloads) section or from the [latest release](https://github.com/antfu/furifont/releases/latest). [Furifont.zip](https://github.com/antfu/furifont/releases/latest/download/Furifont.zip) has all of them.

There are four families: Sans and Serif, each with hiragana or romaji furigana. Each family comes in two kinds of file:

| File | Family name in apps | Weights |
| --- | --- | --- |
| `FurifontSansVF.ttf` | Furifont Sans VF | Every weight, from ExtraLight to Heavy |
| `FurifontSans-Regular.otf` | Furifont Sans | Regular only |

Pick the variable font (`VF.ttf`) if your apps support variable fonts. Its furigana follows the weight of the text. Use the `.otf` file for an app that does not show the variable font, or shows only one weight of it.

The `.woff2` files are for websites. Computers do not install them. See [Use on your website](/docs/website).

## macOS

1. Double-click the `.ttf` or `.otf` file. Font Book opens.
2. Click **Install**.

You can also drag the files into the `Library/Fonts` folder in your home folder. To install the font for all users, use `/Library/Fonts` instead.

## Windows

1. Right-click the `.ttf` or `.otf` file.
2. Click **Install** for your user only, or **Install for all users**.

You can also drag the files onto **Settings > Personalization > Fonts**. On Windows 11, first click **Show more options** to see **Install** in the menu.

## Linux

Copy the files to your fonts folder, then refresh the font cache:

```sh
mkdir -p ~/.local/share/fonts
cp FurifontSansVF.ttf ~/.local/share/fonts/
fc-cache -f
```

Check that the system finds it:

```sh
fc-list | grep Furifont
```

To install for all users, copy the files to `/usr/local/share/fonts` instead (with `sudo`).

## After you install

- Restart the apps that were open, so they see the new font.
- Give lines enough height. The furigana sits above the kanji, so text needs a line spacing of about 1.6 or more, or the furigana is cut off.
- To hide the furigana without changing the font, turn on **Stylistic Set 1**. In Word for Windows, it is in **Font > Advanced > Stylistic sets**. On macOS, apps that use the system font panel show it under **Typography**.
- To show another reading of a word, see [Choose a reading](/docs/readings).
