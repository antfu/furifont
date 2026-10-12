import { describe, expect, it } from 'vitest'
import { detectLocale } from '../app/utils/locale'

describe('detectLocale', () => {
  it.each([
    [['ja-JP', 'en'], 'ja'],
    [['zh-CN'], 'zh-CN'],
    [['zh-SG'], 'zh-CN'],
    [['zh-Hans-CN'], 'zh-CN'],
    [['zh-TW'], 'zh-TW'],
    [['zh-HK'], 'zh-TW'],
    [['zh-Hant'], 'zh-TW'],
    [['zh'], 'zh-CN'],
    [['en-GB', 'ja'], 'en'],
    [['fr-FR', 'ja-JP'], 'ja'],
    [['ko-KR'], 'en'],
    [[], 'en'],
  ] as const)('reads %j as %s', (languages, locale) => {
    expect(detectLocale(languages)).toBe(locale)
  })
})
