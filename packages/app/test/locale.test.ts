import { describe, expect, it } from 'vitest'
import { detectLocale } from '../app/utils/locale'

describe('detectLocale', () => {
  it.each([
    [['ja-JP', 'en'], 'ja'],
    [['zh-CN'], 'zh-Hans'],
    [['zh-SG'], 'zh-Hans'],
    [['zh-Hans-CN'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hant'],
    [['zh-HK'], 'zh-Hant'],
    [['zh-Hant'], 'zh-Hant'],
    [['zh'], 'zh-Hans'],
    [['en-GB', 'ja'], 'en'],
    [['fr-FR', 'ja-JP'], 'ja'],
    [['ko-KR'], 'en'],
    [[], 'en'],
  ] as const)('reads %j as %s', (languages, locale) => {
    expect(detectLocale(languages)).toBe(locale)
  })
})
