import { isMonospace, parseFontStack } from '@furifont/helper-web'
import { describe, expect, it } from 'vitest'

describe('parseFontStack', () => {
  it('splits a computed font-family, keeping quoted names whole', () => {
    expect(parseFontStack('"Google Sans", Roboto, "Hiragino Kaku Gothic ProN", "a, b", sans-serif'))
      .toEqual(['"Google Sans"', 'Roboto', '"Hiragino Kaku Gothic ProN"', '"a, b"', 'sans-serif'])
    expect(parseFontStack(`'Yu Mincho',serif`)).toEqual([`'Yu Mincho'`, 'serif'])
  })
})

describe('isMonospace', () => {
  it.each([
    'monospace',
    'ui-monospace, SFMono-Regular, Menlo, monospace',
    '"Roboto Mono"',
    'Consolas, "Courier New"',
    '"Osaka−等幅"',
    '"Noto Sans JP", monospace',
  ])('takes %s for code', (value) => {
    expect(isMonospace(parseFontStack(value))).toBe(true)
  })

  it.each([
    '"Noto Sans JP", sans-serif',
    '"Hiragino Mincho ProN", serif',
    '"Google Sans", Roboto, Arial, sans-serif',
    '"Material Symbols Outlined"',
    'Meiryo, "Roboto Mono"',
  ])('takes %s for text', (value) => {
    expect(isMonospace(parseFontStack(value))).toBe(false)
  })
})
