import type { DictionarySources } from '../src'
import { fuseDictionary } from '../src'

/** A tiny dictionary exercising each planning rule. */
export const sources: DictionarySources = {
  versions: { fixture: '1' },
  onyomi: { 日: ['にち', 'じつ'], 本: ['ほん'], 学: ['がく'], 校: ['こう'], 大: ['だい', 'たい'], 人: ['じん', 'にん'], 気: ['き', 'け'] },
  entries: [
    { form: '日本', furigana: '0:に;1:ほん', nf: 1, priority: 'ichi1 news1 nf01', order: 0 },
    { form: '今日', furigana: '0-1:きょう', nf: 2, priority: 'ichi1', order: 0 },
    { form: '今日', furigana: '0:こん;1:にち', nf: 2, priority: 'ichi1 news1 nf02', order: 1 },
    { form: '今日', furigana: '0:こん;1:じつ', nf: 2, priority: '', order: 3 },
    { form: '今日は', furigana: '0:こん;1:にち', nf: 0, priority: 'ichi1', order: 0 },
    { form: '学校', furigana: '0:がっ;1:こう', nf: 1, priority: 'ichi1 news1 nf01', order: 0 },
    { form: '大学', furigana: '0:だい;1:がく', nf: 1, priority: 'ichi1 news1 nf01', order: 0 },
    { form: '人気', furigana: '0:にん;1:き', nf: 1, priority: 'ichi1 news1 nf01', order: 0 },
    { form: '大人', furigana: '0-1:おとな', nf: 3, priority: 'ichi1 news1 nf03', order: 0 },
    { form: '大人気', furigana: '0:だい;1:にん;2:き', nf: 0, priority: '', order: 0 },
    { form: '桜', furigana: '0:さくら', nf: 5, priority: 'ichi1 news1 nf05', order: 0 },
    { form: '書く', furigana: '0:か', nf: 8, priority: 'ichi1 news1 nf08', order: 0 },
    { form: '書', furigana: '0:しょ', nf: 9, priority: 'news1 nf09', order: 0 },
    { form: '東京', furigana: '0:とう;1:きょう', nf: 25, priority: 'news2 nf25 spec1', order: 0 },
    { form: '来る', furigana: '0:く', nf: 3, priority: 'ichi1 news1 nf03', order: 0, conjugatesReading: true },
    { form: '奉る', furigana: '0:たてまつ', nf: 0, priority: '', order: 0 },
    { form: '奉仕', furigana: '0:ほう;1:し', nf: 3, priority: 'ichi1 news1 nf03', order: 0 },
  ],
  places: [],
  manual: {},
  defaults: [],
  bare: [],
}

export const dictionary = fuseDictionary(sources)

export const coverage = new Set<number>(
  [...'日本今学校大人気桜書来東京奉仕', ...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽっゃゅょ', ...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポッャュョ', ...'abcdefghijklmnopqrstuvwxyzōū\'']
    .map(c => c.codePointAt(0)!),
)
