# 安装字体

把 Furifont 安装到电脑上，就能在任何可以选择字体的应用中使用它：文字处理、设计工具、幻灯片、笔记和浏览器。

## 选择文件

可以从 [下载](/#downloads) 部分或 [最新版本](https://github.com/antfu/furifont/releases/latest) 获取字体。[Furifont.zip](https://github.com/antfu/furifont/releases/latest/download/Furifont.zip) 包含全部字体。

共有四个字体家族：黑体和宋体，各有平假名和罗马字两种振假名。每个家族都有两种文件：

| 文件 | 应用中的字体名称 | 字重 |
| --- | --- | --- |
| `FurifontSansVF.ttf` | Furifont Sans VF | 从 ExtraLight 到 Heavy 的所有字重 |
| `FurifontSans-Regular.otf` | Furifont Sans | 仅 Regular |

如果你的应用支持可变字体，请选择可变字体（`VF.ttf`）。它的振假名会跟随文字的字重变化。如果应用不显示可变字体，或只显示其中一种字重，请使用 `.otf` 文件。

`.woff2` 文件用于网站，不用安装到电脑上。请参阅 [在网站上使用](/docs/website)。

## macOS

1. 双击 `.ttf` 或 `.otf` 文件，会打开“字体册”。
2. 点击 **安装**。

也可以把文件拖到个人文件夹中的 `Library/Fonts` 文件夹。要为所有用户安装，请改用 `/Library/Fonts`。

## Windows

1. 右键点击 `.ttf` 或 `.otf` 文件。
2. 点击 **安装** 只为自己安装，或点击 **为所有用户安装**。

也可以把文件拖到 **设置 > 个性化 > 字体**。在 Windows 11 上，要先点击 **显示更多选项**，菜单中才会出现 **安装**。

## Linux

把文件复制到字体文件夹，然后刷新字体缓存：

```sh
mkdir -p ~/.local/share/fonts
cp FurifontSansVF.ttf ~/.local/share/fonts/
fc-cache -f
```

确认系统能找到它：

```sh
fc-list | grep Furifont
```

要为所有用户安装，请改为复制到 `/usr/local/share/fonts`（需要 `sudo`）。

## 安装之后

- 重新启动之前已打开的应用，它们才能看到新字体。
- 给行留出足够的高度。振假名位于汉字上方，所以行距需要在 1.6 左右或以上，否则振假名会被截掉。
- 要在不换字体的情况下隐藏振假名，请打开 **样式集 1**。在 Windows 版 Word 中，它位于 **字体 > 高级 > 样式集**。在 macOS 上，使用系统字体面板的应用会把它放在 **版式** 下。
- 要显示词的其他读音，请参阅 [选择读音](/docs/readings)。
