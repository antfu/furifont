/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FIXTURE_FONT, TEST_FONT } from './setup'

const CLI = fileURLToPath(new URL('../../packages/cli/bin.mjs', import.meta.url))

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

let cwd: string
let studio: ChildProcess
let url: string

test.beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'furifont-studio-'))
  await writeFile(join(cwd, 'furifont.config.json'), JSON.stringify({ base: FIXTURE_FONT }))
  const port = await freePort()
  studio = spawn(process.execPath, [CLI, 'dev', '--no-open', '--no-auth', '--port', String(port)], { cwd })
  url = await new Promise((resolve, reject) => {
    studio.stdout!.on('data', (chunk: Buffer) => {
      const match = /Furifont studio: (\S+)/.exec(String(chunk))
      if (match)
        resolve(match[1]!)
    })
    studio.on('exit', code => reject(new Error(`furifont dev exited with ${code}`)))
  })
})

test.afterAll(async () => {
  studio.kill()
  await rm(cwd, { recursive: true, force: true })
})

test('speaks the browser\'s language and remembers the one chosen', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-TW' })
  const page = await context.newPage()
  await page.goto(new URL('/', url).href)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('交給字型')

  await page.getByLabel('語言').selectOption('ja')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('フォントが振る')
  await context.close()
})

test('shows another sample on shuffle', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const sample = page.getByRole('textbox').first()
  const before = await sample.textContent()
  await page.getByRole('button', { name: 'Show another sample' }).first().click()
  await expect(sample).not.toHaveText(before!)
})

test('previews, plans and builds a font', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText(/\d+ glyphs \/ \d+ ms/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Ruby glyphs', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'Romaji' }).click()
  await expect(page.locator('main [style*="Furifont Preview"]')).toBeVisible()

  await page.getByRole('button', { name: 'Build font' }).click()
  const otf = page.getByRole('link', { name: /\.otf$/ })
  await expect(otf).toBeVisible({ timeout: 60_000 })
  const download = await page.request.get(new URL((await otf.getAttribute('href'))!, url).href)
  expect(download.ok()).toBe(true)
  expect((await download.body()).subarray(0, 4).toString()).toBe('OTTO')
})

/** Opens a page on another site, in `lang`, with tight lines; the demo site's fonts are the test font. */
async function openElsewhere(page: Page, lang: string): Promise<void> {
  const font = await readFile(TEST_FONT)
  await page.route('https://furifont.antfu.me/fonts/**', route =>
    route.fulfill({ body: font, contentType: 'font/otf', headers: { 'access-control-allow-origin': '*' } }))
  await page.route('https://elsewhere.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="${lang}"><meta charset="utf-8">
      <body style="font: 20px/1.2 monospace"><p id="kanji">日本の市場</p><p id="latin">Market</p>`,
  }))
  await page.goto('https://elsewhere.test/')
}

function styleOf(page: Page, id: string): Promise<{ fontFamily: string, lineHeight: string }> {
  return page.evaluate((id) => {
    const { fontFamily, lineHeight } = getComputedStyle(document.getElementById(id)!)
    return { fontFamily, lineHeight }
  }, id)
}

function hasLoaded(page: Page, family: string): Promise<boolean> {
  return page.evaluate(family => [...document.fonts].some(face => face.family.includes(family) && face.status === 'loaded'), family)
}

test('sets another site in Furifont from the bookmarklet, and a second click turns it off', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'On any page' }) })
  await section.getByRole('radio', { name: 'Serif' }).click()
  const href = await section.getByRole('link', { name: 'Furifont Serif', exact: true }).getAttribute('href')
  const click = (): Promise<void> => page.evaluate(decodeURIComponent(href!.replace(/^javascript:/, '')))

  await openElsewhere(page, 'en')
  await click()
  expect(await styleOf(page, 'kanji')).toEqual({ fontFamily: '"Furifont Serif", serif', lineHeight: 'normal' })
  expect(await styleOf(page, 'latin')).toEqual({ fontFamily: '"Furifont Serif", serif', lineHeight: '24px' })
  await expect.poll(() => hasLoaded(page, 'Furifont Serif')).toBe(true)

  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p id="later">東京</p>'))
  await expect.poll(async () => (await styleOf(page, 'later')).lineHeight).toBe('normal')

  await click()
  expect(await styleOf(page, 'kanji')).toEqual({ fontFamily: 'monospace', lineHeight: '24px' })
})

test('turns the userscript on by itself on Japanese pages, and its menu switches family', async ({ page }) => {
  const userscript = await (await page.request.get(new URL('/furifont.user.js', url).href)).text()
  expect(userscript).toMatch(/^\/\/ ==UserScript==\n/)
  // A userscript manager: its menu commands are buttons, its values outlive a reload.
  await page.addInitScript(() => Object.assign(window, {
    GM_getValue: (key: string, fallback: string) => localStorage.getItem(key) ?? fallback,
    GM_setValue: (key: string, value: string) => localStorage.setItem(key, value),
    GM_registerMenuCommand: (caption: string, onClick: () => void) => {
      const button = document.createElement('button')
      button.textContent = caption
      button.onclick = onClick
      document.body.append(button)
    },
    GM_xmlhttpRequest: ({ url, onload }: { url: string, onload: (response: { response: ArrayBuffer }) => void }) =>
      fetch(url).then(r => r.arrayBuffer()).then(response => onload({ response })),
  }))

  await openElsewhere(page, 'en')
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe('monospace')

  await openElsewhere(page, 'ja-JP')
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe('"Furifont Sans", sans-serif')
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)

  await page.getByRole('button', { name: 'Furifont Serif Romaji' }).click()
  expect((await styleOf(page, 'kanji')).fontFamily).toBe('"Furifont Serif Romaji", serif')
  await page.reload()
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe('"Furifont Serif Romaji", serif')

  await page.getByRole('button', { name: 'Furifont Serif Romaji' }).click()
  expect((await styleOf(page, 'kanji')).fontFamily).toBe('monospace')
})
