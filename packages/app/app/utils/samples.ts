/** Famous tanka for the previews, one phrase a line, checked against the prebuilt fonts: no kanji shows a wrong reading. */
export const SAMPLES = [
  '東海の\n小島の磯の\n白砂に\nわれ泣きぬれて\n蟹とたはむる', // 石川啄木
  '花の色は\n移りにけりな\nいたづらに\nわが身世にふる\nながめせしまに', // 小野小町
  'ひさかたの\n光のどけき\n春の日に\nしづ心なく\n花の散るらむ', // 紀友則
  'ちはやぶる\n神代も聞かず\n竜田川\nからくれなゐに\n水くくるとは', // 在原業平
  '奥山に\n紅葉踏み分け\n鳴く鹿の\n声聞く時ぞ\n秋は悲しき', // 猿丸大夫
  'これやこの\n行くも帰るも\n別れては\n知るも知らぬも\n逢坂の関', // 蝉丸
  '君がため\n春の野に出でて\n若菜つむ\nわが衣手に\n雪は降りつつ', // 光孝天皇
  '花さそふ\n嵐の庭の\n雪ならで\nふりゆくものは\nわが身なりけり', // 入道前太政大臣
  'やは肌の\nあつき血汐に\nふれも見で\nさびしからずや\n道を説く君', // 与謝野晶子
  'いのちなき\n砂のかなしさよ\nさらさらと\n握れば指の\nあひだより落つ', // 石川啄木
  'かにかくに\n祇園はこひし\n寝るときも\n枕のしたを\n水のながるる', // 吉井勇
  'ゆく秋の\n大和の国の\n薬師寺の\n塔の上なる\nひとひらの雲', // 佐佐木信綱
]

/** A sample other than `current`, at random. */
export function otherSample(current: string): string {
  const others = SAMPLES.filter(s => s !== current)
  return others[Math.floor(Math.random() * others.length)]!
}
