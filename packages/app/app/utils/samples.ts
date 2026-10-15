export interface Sample { text: string, /** The text in hiragana, as the dictionary reads it; the sample test checks it. */ reading: string, author?: string }

/** Famous tanka (and a few haiku, and plain sentences that show longest-word and place-name readings) for the previews, in common words only, one phrase a line, each with its reading, which the sample test checks against the dictionary: no kanji shows a wrong reading. */
export const SAMPLES: Sample[] = [
  { text: '今日は桜が満開\n新幹線で京都まで', reading: 'きょうはさくらがまんかい\nしんかんせんできょうとまで' },
  { text: '東京特許許可局', reading: 'とうきょうとっきょきょかきょく' },
  { text: 'ひさかたの\n光のどけき\n春の日に\nしづ心なく\n花の散るらむ', reading: 'ひさかたの\nひかりのどけき\nはるのひに\nしづこころなく\nはなのちるらむ', author: '紀友則' },
  { text: '花さそふ\n嵐の庭の\n雪ならで\nふりゆくものは\nわが身なりけり', reading: 'はなさそふ\nあらしのにわの\nゆきならで\nふりゆくものは\nわがみなりけり', author: '入道前太政大臣' },
  { text: 'いのちなき\n砂のかなしさよ\nさらさらと\n握れば指の\nあひだより落つ', reading: 'いのちなき\nすなのかなしさよ\nさらさらと\nにぎればゆびの\nあひだよりおつ', author: '石川啄木' },
  { text: 'かにかくに\n祇園はこひし\n寝るときも\n枕のしたを\n水のながるる', reading: 'かにかくに\nぎおんはこひし\nねるときも\nまくらのしたを\nみずのながるる', author: '吉井勇' },
  { text: 'この味が\nいいねと君が\n言ったから\n七月六日は\nサラダ記念日', reading: 'このあじが\nいいねときみが\nいったから\nしちがつむいかは\nさらだきねんび', author: '俵万智' },
  { text: '柿くへば\n鐘が鳴るなり\n法隆寺', reading: 'かきくへば\nかねがなるなり\nほうりゅうじ', author: '正岡子規' },
  { text: '菜の花や\n月は東に\n日は西に', reading: 'なのはなや\nつきはひがしに\nひはにしに', author: '与謝蕪村' },
  { text: '朝顔に\nつるべとられて\nもらひ水', reading: 'あさがおに\nつるべとられて\nもらひみず', author: '加賀千代女' },
  { text: '閑さや\n岩にしみ入る\n蝉の声', reading: 'しずけさや\nいわにしみいる\nせみのこえ', author: '松尾芭蕉' },
  { text: '海を知らぬ\n少女の前に\n麦藁帽の\nわれは両手を\nひろげていたり', reading: 'うみをしらぬ\nしょうじょのまえに\nむぎわらぼうの\nわれはりょうてを\nひろげていたり', author: '寺山修司' },
  { text: '五月雨を\n集めて早し\n最上川', reading: 'さみだれを\nあつめてはやし\nもがみがわ', author: '松尾芭蕉' },
  { text: '我と来て\n遊べや親の\nない雀', reading: 'われときて\nあそべやおやの\nないすずめ', author: '小林一茶' },
]

/** A sample other than the one with `current` text, at random. */
export function otherSample(current: string): Sample {
  const others = SAMPLES.filter(s => s.text !== current)
  return others[Math.floor(Math.random() * others.length)]!
}
