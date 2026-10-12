/**
 * Default readings the compiled data ranks wrong, in inline notation. JMdict's
 * frequency tags belong to a written form, so across entries they cannot tell
 * two readings apart; and a form that drops its okurigana usually meets it in
 * running text, where the font cannot see it. Users' pins override these.
 */
export const DEFAULT_READINGS: string[] = [
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
]
