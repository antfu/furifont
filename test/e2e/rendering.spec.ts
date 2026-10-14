/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { TEST_FONT, TEST_OTF, WOFF2_PAGE } from './setup'

const ORIGIN = 'https://furifont.test'
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)

/** Shows `body` on a page that has the test font as `Furifont`, at 40px. */
async function show(page: Page, body: string): Promise<void> {
  const font = await readFile(TEST_FONT)
  await page.route(`${ORIGIN}/**`, route => route.request().url().endsWith('.woff2')
    ? route.fulfill({ body: font, contentType: 'font/woff2' })
    : route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><meta charset="utf-8"><style>
          @font-face { font-family: Furifont; src: url(/test.woff2) }
          body { margin: 16px; font: 40px/normal Furifont; }
          p { margin: 0 0 8px; width: fit-content; }
          .off { font-feature-settings: "ss01"; }
        </style>${body}`,
      }))
  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => document.fonts.check('40px Furifont'))).toBe(true)
}

const shot = (page: Page, selector: string): Promise<Buffer> => page.locator(selector).screenshot()

test('draws ruby that ss01 turns off', async ({ page }) => {
  await show(page, '<p id="on">日本</p><p id="off" class="off">日本</p>')
  expect(await shot(page, '#on')).not.toEqual(await shot(page, '#off'))
})

test('picks a reading with a variation selector, or none', async ({ page }) => {
  await show(page, `
    <p id="default">市場</p><p id="second">市${VS(2)}場</p>
    <p id="suppressed">日${VS(0)}本</p><p id="plain" class="off">日本</p>`)
  expect(await shot(page, '#second')).not.toEqual(await shot(page, '#default'))
  expect(await shot(page, '#suppressed')).toEqual(await shot(page, '#plain'))
})

test('keeps the text plain for selection and copy', async ({ page }) => {
  const text = `今日は日本語の勉強をします。市${VS(2)}場`
  await show(page, `<p id="p">${text}</p>`)
  const selected = await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('p')!)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
    return getSelection()!.toString()
  })
  expect(selected).toBe(text)
})

test('fits the ruby in the default line height', async ({ page }) => {
  // Clipped to its line box, the ruby must still show in full.
  await show(page, '<p id="clipped" style="overflow:hidden">日本</p><p id="free" style="overflow:visible">日本</p>')
  expect(await shot(page, '#clipped')).toEqual(await shot(page, '#free'))
})

test('wraps annotated text into lines that do not overlap', async ({ page }) => {
  const text = '日本語の勉強をします。今日は東京の大学へ行きます。'
  await show(page, `<p id="p" style="width:6em">${text}</p>`)
  const lines = await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('p')!)
    const tops = [...new Set([...range.getClientRects()].map(r => Math.round(r.top)))]
    return tops.sort((a, b) => a - b)
  })
  expect(lines.length).toBeGreaterThan(2)
  for (let i = 1; i < lines.length; i++)
    expect(lines[i]! - lines[i - 1]!).toBeGreaterThanOrEqual(40 * 1.55)
  expect(await page.locator('#p').textContent()).toBe(text)
})

// Firefox compresses with its own Brotli; Chromium and Playwright's WebKit have no Brotli compression stream and load brotli-wasm.
test('compresses a WOFF2 in the browser that draws like its OpenType font', async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script type="module" src="/woff2.js"></script>' })
    return route.fulfill({ path: path === '/test.otf' ? TEST_OTF : join(WOFF2_PAGE, path) })
  })
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => 'toWoff2' in window)
  const sizes = await page.evaluate(async () => {
    const otf = new Uint8Array(await (await fetch('/test.otf')).arrayBuffer())
    const woff2 = await window.toWoff2(otf)
    for (const [family, data] of [['OTF', otf], ['WOFF2', woff2]] as const)
      document.fonts.add(await new FontFace(family, data).load())
    document.body.innerHTML = '<p id="otf" style="font: 40px OTF">日本語の市場</p><p id="woff2" style="font: 40px WOFF2">日本語の市場</p>'
    return { otf: otf.length, woff2: woff2.length }
  })
  expect(sizes.woff2).toBeLessThan(sizes.otf)
  expect(await shot(page, '#woff2')).toEqual(await shot(page, '#otf'))
})
