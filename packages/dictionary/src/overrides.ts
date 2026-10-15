/**
 * Readings that override the compiled data where it ranks them wrong, in inline notation. JMdict's
 * frequency tags belong to a written form, so across entries they cannot tell
 * two readings apart; and a form that drops its okurigana usually meets it in
 * running text, where the font cannot see it. Users' pins override these.
 */
export const OVERRIDE_READINGS: string[] = [
  // 出来る, 出来た: しゅったい is rare.
  '出[で]来[き]',
  // なにびと is literary.
  '何[なん]人[にん]',
  // いつ is mostly written in kana.
  '何[なん]時[じ]',
  // The date; みそか is the last day of a month.
  '三[さん]十[じゅう]日[にち]',
  // Nearly always written 外付け.
  '外[そと]付[づ]',
  // 支払い, 支払う.
  '支[し]払[はら]',
  // Alone, 字 is a character; あざ is a village section and ranks higher. A run
  // of kanji never includes the kana before it, so ローマ字 reaches the font as 字.
  '字[じ]',
  // 明朝体 is read みんちょう; みょうちょう is the dynasty's old reading.
  '明[みん]朝[ちょう]',
]

/**
 * Kanji left bare when alone in a run, though one reading dominates the
 * dictionary: the reading depends on the word around it, which a font cannot
 * see past the run. 月 is つき in a poem and がつ in a date.
 */
export const BARE_FORMS: string[] = [
  '月',
  '日',
  '年',
]
