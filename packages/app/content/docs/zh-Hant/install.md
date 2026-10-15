# 安裝字型

把 Furifont 安裝到電腦上，就能在任何可以選擇字型的應用程式中使用它：文書處理、設計工具、簡報、筆記和瀏覽器。

## 選擇檔案

可以從 [下載](/#downloads) 區塊或 [最新版本](https://github.com/antfu/furifont/releases/latest) 取得字型。[Furifont.zip](https://github.com/antfu/furifont/releases/latest/download/Furifont.zip) 包含全部字型。

共有四個字型家族：黑體和明體，各有平假名和羅馬字兩種振假名。每個家族都有兩種檔案：

| 檔案 | 應用程式中的字型名稱 | 字重 |
| --- | --- | --- |
| `FurifontSansVF.ttf` | Furifont Sans VF | 從 ExtraLight 到 Heavy 的所有字重 |
| `FurifontSans-Regular.otf` | Furifont Sans | 僅 Regular |

如果你的應用程式支援可變字型，請選擇可變字型（`VF.ttf`）。它的振假名會跟著文字的字重變化。如果應用程式不顯示可變字型，或只顯示其中一種字重，請使用 `.otf` 檔案。

`.woff2` 檔案用於網站，不用安裝到電腦上。請參閱 [在網站上使用](/docs/website)。

## macOS

1. 按兩下 `.ttf` 或 `.otf` 檔案，會開啟「字體簿」。
2. 按一下 **安裝**。

也可以把檔案拖到個人專屬資料夾中的 `Library/Fonts` 資料夾。要為所有使用者安裝，請改用 `/Library/Fonts`。

## Windows

1. 在 `.ttf` 或 `.otf` 檔案上按右鍵。
2. 按一下 **安裝** 只為自己安裝，或按一下 **為所有使用者安裝**。

也可以把檔案拖到 **設定 > 個人化 > 字型**。在 Windows 11 上，要先按一下 **顯示更多選項**，選單中才會出現 **安裝**。

## Linux

把檔案複製到字型資料夾，然後重新整理字型快取：

```sh
mkdir -p ~/.local/share/fonts
cp FurifontSansVF.ttf ~/.local/share/fonts/
fc-cache -f
```

確認系統找得到它：

```sh
fc-list | grep Furifont
```

要為所有使用者安裝，請改為複製到 `/usr/local/share/fonts`（需要 `sudo`）。

## 安裝之後

- 重新啟動先前已開啟的應用程式，它們才看得到新字型。
- 給行留出足夠的高度。振假名位在漢字上方，所以行距需要在 1.6 左右或以上，否則振假名會被切掉。
- 要在不換字型的情況下隱藏振假名，請開啟 **樣式集 1**。在 Windows 版 Word 中，它位於 **字型 > 進階 > 樣式集**。在 macOS 上，使用系統字型面板的應用程式會把它放在 **排版** 下。
- 要顯示詞的其他讀音，請參閱 [選擇讀音](/docs/readings)。
