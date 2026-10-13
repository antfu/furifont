/** Texts for the previews, checked against the prebuilt fonts: every kanji shows its usual reading. */
export const SAMPLES = [
  '今日は\n日本語の勉強を\nします。',
  '明日の朝\n新宿で\n待ち合わせ。',
  '富士山が\n窓から\n見えた。',
  '夏休みに\n北海道を\n旅した。',
  '子供たちが\n公園で\n遊んでいる。',
  '週末は\n家族と\n海で泳ぐ。',
  '東京から\n大阪まで\n新幹線で。',
  '冬の朝は\n布団が\n恋しい。',
  '横浜の\n港で\n船を見る。',
  '先生に\n手紙を\n送る。',
  '牛乳と\n卵を\n買った。',
  '天気予報は\n雨のち\n曇り。',
]

/** A sample other than `current`, at random. */
export function otherSample(current: string): string {
  const others = SAMPLES.filter(s => s !== current)
  return others[Math.floor(Math.random() * others.length)]!
}
