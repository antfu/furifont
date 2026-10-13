export interface Sample { text: string, author: string }

/** Famous tanka (and a few haiku) for the previews, one phrase a line, checked against the prebuilt fonts: no kanji shows a wrong reading. */
export const SAMPLES: Sample[] = [
  { text: 'この世をば\n我が世とぞ思ふ\n望月の\n欠けたることも\n無しと思へば', author: '藤原道長' },
  { text: 'やせ蛙\nまけるな一茶\nこれにあり', author: '小林一茶' },
  { text: '五月雨を\n集めて早し\n最上川', author: '松尾芭蕉' },
  { text: '東海の\n小島の磯の\n白砂に\nわれ泣きぬれて\n蟹とたはむる', author: '石川啄木' },
  { text: '花の色は\n移りにけりな\nいたづらに\nわが身世にふる\nながめせしまに', author: '小野小町' },
  { text: 'ひさかたの\n光のどけき\n春の日に\nしづ心なく\n花の散るらむ', author: '紀友則' },
  { text: 'ちはやぶる\n神代も聞かず\n竜田川\nからくれなゐに\n水くくるとは', author: '在原業平' },
  { text: '奥山に\n紅葉踏み分け\n鳴く鹿の\n声聞く時ぞ\n秋は悲しき', author: '猿丸大夫' },
  { text: 'これやこの\n行くも帰るも\n別れては\n知るも知らぬも\n逢坂の関', author: '蝉丸' },
  { text: '君がため\n春の野に出でて\n若菜つむ\nわが衣手に\n雪は降りつつ', author: '光孝天皇' },
  { text: '花さそふ\n嵐の庭の\n雪ならで\nふりゆくものは\nわが身なりけり', author: '入道前太政大臣' },
  { text: 'やは肌の\nあつき血汐に\nふれも見で\nさびしからずや\n道を説く君', author: '与謝野晶子' },
  { text: 'いのちなき\n砂のかなしさよ\nさらさらと\n握れば指の\nあひだより落つ', author: '石川啄木' },
  { text: 'かにかくに\n祇園はこひし\n寝るときも\n枕のしたを\n水のながるる', author: '吉井勇' },
  { text: 'ゆく秋の\n大和の国の\n薬師寺の\n塔の上なる\nひとひらの雲', author: '佐佐木信綱' },
]

/** A sample other than the one with `current` text, at random. */
export function otherSample(current: string): Sample {
  const others = SAMPLES.filter(s => s.text !== current)
  return others[Math.floor(Math.random() * others.length)]!
}
