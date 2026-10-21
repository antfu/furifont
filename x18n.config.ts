import { defineConfig } from '@x18n/cli'

export default defineConfig({
  sourceLocale: 'en',
  presets: [
    'vue-i18n',
  ],
  resources: [
    {
      pattern: 'packages/app/app/locales/{locale}.json',
    },
  ],
  keyStyle: 'nested',
  usage: {
    // The userscript route reads these as whole objects from the locale files.
    keysInUse: ['anyPage.toast.userscript', 'anyPage.menu.okuriganaOn', 'anyPage.menu.okuriganaOff'],
  },
  glossary: [
    { term: 'Furifont', doNotTranslate: true },
    { term: 'JMdict', doNotTranslate: true },
    { term: 'JLPT', doNotTranslate: true },
    { term: 'Tampermonkey', doNotTranslate: true },
    { term: 'Violentmonkey', doNotTranslate: true },
    { term: 'Furigana', translations: { 'ja': 'ふりがな', 'zh-Hans': '振假名', 'zh-Hant': '振假名' }, note: 'ja: use ふりがな in prose; avoid ルビ' },
    { term: 'Okurigana', translations: { 'ja': '送りがな', 'zh-Hans': '送假名', 'zh-Hant': '送假名' } },
    { term: 'Hiragana', translations: { 'ja': 'ひらがな', 'zh-Hans': '平假名', 'zh-Hant': '平假名' } },
    { term: 'Katakana', translations: { 'ja': 'カタカナ', 'zh-Hans': '片假名', 'zh-Hant': '片假名' } },
    { term: 'Romaji', translations: { 'ja': 'ローマ字', 'zh-Hans': '罗马字', 'zh-Hant': '羅馬字' } },
    { term: 'Kanji', translations: { 'ja': '漢字', 'zh-Hans': '汉字', 'zh-Hant': '漢字' } },
    { term: 'Reading', translations: { 'ja': '読み', 'zh-Hans': '读音', 'zh-Hant': '讀音' }, note: 'How a word is pronounced, not the act of reading' },
    { term: 'Word', translations: { 'ja': '単語', 'zh-Hans': '词语', 'zh-Hant': '詞語' } },
    { term: 'Dictionary', translations: { 'ja': '辞書', 'zh-Hans': '词典', 'zh-Hant': '辭典' } },
    { term: 'Font', translations: { 'ja': 'フォント', 'zh-Hans': '字体', 'zh-Hant': '字型' } },
    { term: 'Glyph', translations: { 'ja': 'グリフ', 'zh-Hans': '字形', 'zh-Hant': '字形' } },
    { term: 'Ligature', translations: { 'ja': '合字', 'zh-Hans': '连字', 'zh-Hant': '連字' } },
    { term: 'Variation selector', translations: { 'ja': '異体字セレクタ', 'zh-Hans': '变体选择器', 'zh-Hant': '變體選擇器' }, note: 'An invisible character after a kanji; VS241 to VS243 are written as is' },
    { term: 'Bookmarklet', translations: { 'ja': 'ブックマークレット', 'zh-Hans': '书签小工具', 'zh-Hant': '書籤小工具' } },
    { term: 'Userscript', translations: { 'ja': 'ユーザースクリプト', 'zh-Hans': '用户脚本', 'zh-Hant': '使用者腳本' } },
    { term: 'Report', translations: { 'ja': '報告', 'zh-Hans': '报告', 'zh-Hant': '回報' }, note: 'A reader reporting a wrong reading' },
    { term: 'Customize', translations: { 'ja': 'カスタマイズ', 'zh-Hans': '自定义', 'zh-Hant': '自訂' } },
  ],
  // The glossary check matches whole words with \p{L} boundaries, which never hold in ja/zh text
  // (no spaces), so it flags every message. The glossary still feeds `x18n prompt`.
  checks: { glossary: 'off' },
})
