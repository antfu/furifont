import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { FIXTURE_FONT } from './setup'

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
  // The reading lists of a font already built, which the playground's selectors index into.
  await mkdir(join(cwd, 'fonts'))
  await writeFile(join(cwd, 'fonts', 'FurifontSansJP-Regular.ivs.json'), JSON.stringify({ kanji: { 来: ['き', 'こ'] }, words: {}, lone: {} }))
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
  await page.goto(new URL('/#/', url).href)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('交給字型')

  await page.getByLabel('語言').selectOption('ja')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('フォントが振る')
  await context.close()
})

test('writes the selectors for verbs from the playground', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const playground = page.locator('section', { has: page.getByRole('heading', { name: 'Try it' }) })
  await playground.getByRole('textbox').fill('来ない。来ます。')
  await playground.getByRole('button', { name: 'Add selectors for verbs' }).click()
  await expect(playground.getByRole('textbox')).toHaveText('来\u{E01E2}ない。来\u{E01E1}ます。', { timeout: 30_000 })
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
