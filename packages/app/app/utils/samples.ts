export interface Sample { text: string, author?: string }

/** Famous tanka (and a few haiku, and plain sentences that show longest-word and place-name readings) for the previews, in common words only, one phrase a line, checked against the prebuilt fonts: no kanji shows a wrong reading. */
export const SAMPLES: Sample[] = [
  { text: '今日は桜が満開\n新幹線で京都まで' },
  { text: 'ひさかたの\n光のどけき\n春の日に\nしづ心なく\n花の散るらむ', author: '紀友則' },
  { text: '花さそふ\n嵐の庭の\n雪ならで\nふりゆくものは\nわが身なりけり', author: '入道前太政大臣' },
  { text: 'いのちなき\n砂のかなしさよ\nさらさらと\n握れば指の\nあひだより落つ', author: '石川啄木' },
  { text: 'かにかくに\n祇園はこひし\n寝るときも\n枕のしたを\n水のながるる', author: '吉井勇' },
  { text: 'この味が\nいいねと君が\n言ったから\n七月六日は\nサラダ記念日', author: '俵万智' },
  { text: '柿くへば\n鐘が鳴るなり\n法隆寺', author: '正岡子規' },
  { text: '菜の花や\n月は東に\n日は西に', author: '与謝蕪村' },
  { text: '朝顔に\nつるべとられて\nもらひ水', author: '加賀千代女' },
  { text: '田子の浦に\nうち出でてみれば\n白妙の\n富士の高嶺に\n雪は降りつつ', author: '山部赤人' },
  { text: '白鳥は\n哀しからずや\n空の青\n海のあをにも\n染まずただよふ', author: '若山牧水' },
  { text: '閑さや\n岩にしみ入る\n蝉の声', author: '松尾芭蕉' },
  { text: '夏草や\n兵どもが\n夢の跡', author: '松尾芭蕉' },
  { text: '五月雨を\n集めて早し\n最上川', author: '松尾芭蕉' },
  { text: '我と来て\n遊べや親の\nない雀', author: '小林一茶' },
]

/** A sample other than the one with `current` text, at random. */
export function otherSample(current: string): Sample {
  const others = SAMPLES.filter(s => s.text !== current)
  return others[Math.floor(Math.random() * others.length)]!
}
