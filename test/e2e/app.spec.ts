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
import { FIXTURE_FONT, TEST_FONT, TEST_READINGS } from './setup'

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

test('applies the font chosen in the playground to the whole site, and remembers it', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const playground = page.locator('section', { has: page.getByRole('heading', { name: 'Try it' }) })
  await playground.getByRole('radio', { name: 'Romaji' }).click()
  await playground.getByRole('radio', { name: 'Serif' }).click()
  await playground.getByRole('checkbox', { name: 'Furigana' }).uncheck({ force: true })
  await playground.getByRole('checkbox', { name: 'Okurigana readings' }).uncheck({ force: true })
  await page.reload()

  const hero = page.getByRole('textbox').first()
  await expect(hero).toHaveCSS('font-family', '"Furifont Serif Romaji", sans-serif')
  await expect(hero).toHaveCSS('font-feature-settings', '"ss01"')
  const anyPage = page.locator('section', { has: page.getByRole('heading', { name: 'On Websites' }) })
  await expect(anyPage.getByRole('radio', { name: 'Serif' })).toBeChecked()
  await expect(anyPage.getByRole('checkbox', { name: 'Okurigana readings' })).not.toBeChecked()
  await expect(anyPage.getByRole('link', { name: 'Furifont Serif Romaji', exact: true })).toBeVisible()

  await page.getByLabel('Language').selectOption('ja')
  await expect(page.locator('body')).toHaveCSS('font-family', /^"Furifont Serif Romaji"/)
  await expect(page.locator('body')).toHaveCSS('font-feature-settings', '"ss01"')
})

test('previews, plans and builds a font in the formats chosen', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText(/\d+ glyphs \/ \d+ ms/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Furigana glyphs', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'Romaji' }).click()
  await expect(page.locator('main [style*="Furifont Preview"]')).toBeVisible()

  await page.getByRole('button', { name: '.woff2' }).click()
  await expect(page.getByRole('button', { name: '.otf' })).toBeDisabled()
  await expect(page.getByText(/^\d+\.\d\d MB OTF$/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Build font' }).click()
  const otf = page.getByRole('link', { name: /\.otf$/ })
  await expect(otf).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('link', { name: /\.woff2$/ })).toHaveCount(0)
  const download = await page.request.get(new URL((await otf.getAttribute('href'))!, url).href)
  expect(download.ok()).toBe(true)
  expect((await download.body()).subarray(0, 4).toString()).toBe('OTTO')
})

test('estimates the size, keeps settings across reloads, and resets them but not the words', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText(/≈ \d+\.\d\d MB WOFF2 · \d+\.\d\d MB OTF/)).toBeVisible({ timeout: 60_000 })

  const skip = page.getByRole('slider', { name: /Skip the most common words/ })
  const isolated = page.getByRole('checkbox', { name: 'Furigana on single kanji' })
  await skip.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.locator('label', { has: isolated }).click()
  await page.getByLabel('Word to add').fill('推[お]し活[かつ]')
  await page.getByRole('button', { name: 'Add word' }).click()

  await page.reload()
  await expect(skip).toHaveValue('1000')
  await expect(isolated).not.toBeChecked()
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(skip).toHaveValue('0')
  await expect(isolated).toBeChecked()
  await expect(page.getByRole('button', { name: 'Remove 推[お]し活[かつ]' })).toBeVisible()
})

/** The other site's own font, which its Latin text keeps. */
const PAGE_FONT = '"Page Font", sans-serif'

/** Says the demo site serves `version`: a route added later wins. */
async function serveRelease(page: Page, version: string): Promise<void> {
  await page.route('https://furifont.antfu.me/version.json', route => route.fulfill({ json: { version }, headers: { 'access-control-allow-origin': '*' } }))
}

/** Opens a page on another site, in `lang`, with tight lines, code, an icon font and maybe a CSP; the demo site's fonts are the test font, and its release is that font's, 0.0.0. */
async function openElsewhere(page: Page, lang: string, csp?: string): Promise<void> {
  const font = await readFile(TEST_FONT)
  const readings = await readFile(TEST_READINGS)
  const pairs = await (await page.request.get(new URL('/okurigana.json', url).href)).body()
  const cors = { 'access-control-allow-origin': '*' }
  await page.route('https://furifont.antfu.me/fonts/**', route => new URL(route.request().url()).pathname.endsWith('.ivs.json')
    ? route.fulfill({ body: readings, contentType: 'application/json', headers: cors })
    : route.fulfill({ body: font, contentType: 'font/otf', headers: cors }))
  await page.route('https://furifont.antfu.me/okurigana.json', route => route.fulfill({ body: pairs, contentType: 'application/json', headers: cors }))
  await serveRelease(page, '0.0.0')
  await page.route('https://elsewhere.test/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    headers: csp ? { 'content-security-policy': csp } : {},
    body: `<!doctype html><html lang="${lang}"><meta charset="utf-8">
      <body style="font: 20px/1.2 'Page Font', sans-serif"><p id="kanji">日本の市場</p><p id="latin">Market</p><p id="verb">来ない、来ます、来る、今日では、出入り</p>
      <p id="mixed">日本 Market <span id="icon" style="font-family: 'Google Symbols'">search</span></p><pre id="code">日本</pre>
      <p><ruby id="ruby">来ない<rt>こない</rt></ruby></p>`,
  }))
  await page.goto('https://elsewhere.test/')
}

/** A userscript manager: its menu commands are buttons, its values outlive a reload. */
async function addUserscriptManager(page: Page): Promise<void> {
  await page.addInitScript(() => Object.assign(window, {
    GM_getValue: (key: string, fallback: string) => localStorage.getItem(key) ?? fallback,
    GM_setValue: (key: string, value: string) => localStorage.setItem(key, value),
    // With an id, a command replaces the one before it.
    GM_registerMenuCommand: (caption: string, onClick: () => void, options?: { id: string }) => {
      const button = document.createElement('button')
      button.textContent = caption
      button.onclick = onClick
      if (options)
        button.dataset.id = options.id
      document.querySelector(options ? `[data-id="${options.id}"]` : 'x-none')?.remove()
      document.body.append(button)
    },
    GM_xmlhttpRequest: ({ url, responseType, onload, onerror }: { url: string, responseType: 'arraybuffer' | 'text', onload: (response: { response: ArrayBuffer | string }) => void, onerror: () => void }) =>
      fetch(url).then((r): Promise<ArrayBuffer | string> => responseType === 'text' ? r.text() : r.arrayBuffer()).then(response => onload({ response }), onerror),
  }))
}

async function fetchUserscript(page: Page): Promise<string> {
  return (await page.request.get(new URL('/furifont.user.js', url).href)).text()
}

function styleOf(page: Page, id: string): Promise<{ fontFamily: string, lineHeight: string }> {
  return page.evaluate((id) => {
    const { fontFamily, lineHeight } = getComputedStyle(document.getElementById(id)!)
    return { fontFamily, lineHeight }
  }, id)
}

/** How many glyphs of #id's own text come from web fonts, which only Furifont is on that page, and from the system's. */
async function glyphsBySource(page: Page, id: string): Promise<{ web: number, system: number }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${id}` })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  const count = (web: boolean): number => fonts.filter(font => font.isCustomFont === web).reduce((sum, font) => sum + font.glyphCount, 0)
  return { web: count(true), system: count(false) }
}

function hasLoaded(page: Page, family: string): Promise<boolean> {
  return page.evaluate(family => [...document.fonts].some(face => face.family.includes(family) && face.status === 'loaded'), family)
}

test('sets another site in Furifont from the bookmarklet, and a second click turns it off', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'On Websites' }) })
  await section.getByRole('radio', { name: 'Serif' }).click()
  const href = await section.getByRole('link', { name: 'Furifont Serif', exact: true }).getAttribute('href')
  const click = (): Promise<void> => page.evaluate(decodeURIComponent(href!.replace(/^javascript:/, '')))

  await openElsewhere(page, 'en')
  await click()
  expect(await styleOf(page, 'kanji')).toEqual({ fontFamily: `"Furifont Serif", ${PAGE_FONT}`, lineHeight: 'normal' })
  expect(await styleOf(page, 'latin')).toEqual({ fontFamily: PAGE_FONT, lineHeight: '24px' })
  await expect.poll(() => hasLoaded(page, 'Furifont Serif')).toBe(true)
  // Furifont draws 日本, one glyph with its ruby, and the system the 14 Latin letters and spaces around it, the icon's ligature among them.
  expect(await glyphsBySource(page, 'mixed')).toEqual({ web: 1, system: 14 })
  expect((await styleOf(page, 'icon')).fontFamily).toBe('"Google Symbols"')
  expect((await styleOf(page, 'code')).fontFamily).toBe('monospace')
  // The page's own ruby keeps its kanji plain, and gets no okurigana reading on top.
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('ruby')!).fontFeatureSettings)).toBe('"ss01"')
  await expect.poll(async () => (await readVerbs(page)).salts).toEqual(await verbSalts())
  expect(await page.locator('#ruby span').count()).toBe(0)

  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p id="later">東京</p>'))
  await expect.poll(async () => (await styleOf(page, 'later')).lineHeight).toBe('normal')

  await click()
  expect(await styleOf(page, 'kanji')).toEqual({ fontFamily: PAGE_FONT, lineHeight: '24px' })
})

test('asks to install Furifont where a CSP blocks fonts from other sites, and links to the downloads', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'On Websites' }) })
  const href = await section.getByRole('link', { name: 'Furifont Sans', exact: true }).getAttribute('href')

  await openElsewhere(page, 'en', 'font-src \'self\'')
  await page.evaluate(decodeURIComponent(href!.replace(/^javascript:/, '')))
  const toast = page.getByRole('alert')
  await expect(toast).toContainText('On those sites, you must install Furifont on your computer.')
  await expect(toast.getByRole('link', { name: 'Download the fonts' })).toHaveAttribute('href', 'https://furifont.antfu.me/#downloads')
  expect(await styleOf(page, 'kanji')).toEqual({ fontFamily: PAGE_FONT, lineHeight: '24px' })
  await toast.getByRole('button', { name: 'Close' }).click()
  await expect(toast).toBeHidden()

  await page.goto(new URL('/#downloads', url).href)
  await expect(page.locator('#downloads')).toBeInViewport()
})

test('says when the bookmarklet or the installed font is older than the site\'s release, and links to newer ones', async ({ page }) => {
  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'On Websites' }) })
  const href = await section.getByRole('link', { name: 'Furifont Sans', exact: true }).getAttribute('href')
  const click = (): Promise<void> => page.evaluate(decodeURIComponent(href!.replace(/^javascript:/, '')))
  const toast = page.getByRole('alert')

  await openElsewhere(page, 'en')
  await click()
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)
  await page.waitForTimeout(300)
  await expect(toast).toHaveCount(0)

  await openElsewhere(page, 'en')
  await serveRelease(page, '99.0.0')
  await click()
  await expect(toast).toContainText('A newer version of Furifont is out.')
  await expect(toast.getByRole('link', { name: 'Get the new bookmarklet' })).toHaveAttribute('href', 'https://furifont.antfu.me/#any-page')
  await expect(toast.getByRole('link', { name: 'Download the fonts' })).toHaveAttribute('href', 'https://furifont.antfu.me/#downloads')

  // The bookmarklet is the site's own release, and the test font, 0.0.0, older.
  await openElsewhere(page, 'en')
  await serveRelease(page, version)
  await click()
  await expect(toast.getByRole('link', { name: 'Download the fonts' })).toBeVisible()
  await expect(toast.getByRole('link', { name: 'Get the new bookmarklet' })).toHaveCount(0)

  await page.goto(new URL('/#any-page', url).href)
  await expect(page.locator('#any-page')).toBeInViewport()
})

test('says once a day when the userscript is older than the site\'s release, and links to the newer one', async ({ page }) => {
  const userscript = await fetchUserscript(page)
  await addUserscriptManager(page)
  const toast = page.getByRole('alert')

  await openElsewhere(page, 'ja-JP')
  await serveRelease(page, '99.0.0')
  await page.evaluate(userscript)
  await expect(toast.getByRole('link', { name: 'Update the userscript' })).toHaveAttribute('href', 'https://furifont.antfu.me/furifont.user.js')

  await page.reload()
  await page.evaluate(userscript)
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)
  await page.waitForTimeout(300)
  await expect(toast).toHaveCount(0)
})

test('turns the userscript on by itself on Japanese pages, and its menu switches family', async ({ page }) => {
  const userscript = await fetchUserscript(page)
  expect(userscript).toMatch(/^\/\/ ==UserScript==\n/)
  await addUserscriptManager(page)

  await openElsewhere(page, 'en')
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(PAGE_FONT)

  await openElsewhere(page, 'ja-JP')
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(`"Furifont Sans", ${PAGE_FONT}`)
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)

  await page.getByRole('button', { name: 'Furifont Serif Romaji' }).click()
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(`"Furifont Serif Romaji", ${PAGE_FONT}`)
  await page.reload()
  await page.evaluate(userscript)
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(`"Furifont Serif Romaji", ${PAGE_FONT}`)

  await page.getByRole('button', { name: 'Furifont Serif Romaji' }).click()
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(PAGE_FONT)
})

test('turns the userscript back off with a toast in the browser\'s language when the font fails to download', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ja-JP' })
  const page = await context.newPage()
  const userscript = await fetchUserscript(page)
  await addUserscriptManager(page)

  await openElsewhere(page, 'ja')
  await page.route('https://furifont.antfu.me/fonts/**', route => route.abort())
  await page.evaluate(userscript)
  await expect(page.getByRole('alert')).toContainText('パソコンに Furifont をインストールする必要があります。')
  expect((await styleOf(page, 'kanji')).fontFamily).toBe(PAGE_FONT)
  await context.close()
})

/** The `salt` values the wrapped runs of #verb carry, and the page's text. */
function readVerbs(page: Page): Promise<{ salts: (string | null)[], text: string }> {
  return page.evaluate(() => ({
    salts: [...document.querySelectorAll('#verb span')].map(span => span.getAttribute('data-furifont-salt')),
    text: document.getElementById('verb')!.textContent!,
  }))
}

/** What the pairs make of #verb: 来ない, 来ます, 来る, then the words 今日では (こんにち) and 出入り (でい), which sit second in their lists. */
async function verbSalts(): Promise<string[]> {
  const { kanji, words } = JSON.parse(await readFile(TEST_READINGS, 'utf8')) as { kanji: Record<string, string[]>, words: Record<string, string[]> }
  const word = (run: string, reading: string): string => String(words[run]!.findIndex(w => [...w.matchAll(/\[([^\]]*)\]/g)].map(m => m[1]).join('') === reading) + 1)
  return [...['こ', 'き', 'く'].map(reading => String(kanji['来']!.indexOf(reading) + 1)), word('今日', 'こんにち'), word('出入', 'でい')]
}

test('reads 来 as こ, き and く, and words like 今日では, from the okurigana through the userscript, and its menu turns that off', async ({ page }) => {
  const userscript = await fetchUserscript(page)
  await addUserscriptManager(page)

  await openElsewhere(page, 'ja-JP')
  await page.evaluate(userscript)
  // The font shows its default for none of them, so each gets its reading.
  await expect.poll(async () => (await readVerbs(page)).salts).toEqual(await verbSalts())
  // Spans, not text: copy and search see what the page wrote.
  expect((await readVerbs(page)).text).toBe('来ない、来ます、来る、今日では、出入り')

  await page.getByRole('button', { name: 'Okurigana readings: on' }).click()
  await expect(page.getByRole('button', { name: 'Okurigana readings: off' })).toBeVisible()
  expect((await readVerbs(page)).salts.every(salt => salt === null)).toBe(true)

  // The choice outlives a reload, and a page that is off is left alone.
  await page.reload()
  await page.evaluate(userscript)
  await expect(page.getByRole('button', { name: 'Okurigana readings: off' })).toBeVisible()
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)
  expect((await readVerbs(page)).salts).toEqual([])

  await page.getByRole('button', { name: 'Okurigana readings: off' }).click()
  await expect.poll(async () => (await readVerbs(page)).salts).toEqual(await verbSalts())
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p id="later">来ない</p>'))
  await expect.poll(() => page.evaluate(() => document.querySelector('#later span')?.getAttribute('data-furifont-salt'))).toBe((await verbSalts())[0])
})

test('offers the okurigana readings in the bookmarklet, on unless turned off', async ({ page }) => {
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'On Websites' }) })
  const link = section.getByRole('link', { name: 'Furifont Sans', exact: true })
  const on = await link.getAttribute('href')
  await section.getByRole('checkbox', { name: 'Okurigana readings' }).uncheck({ force: true })
  const off = await link.getAttribute('href')
  expect(decodeURIComponent(on!)).toContain('okurigana.json')
  expect(decodeURIComponent(off!)).not.toContain('okurigana.json')

  await openElsewhere(page, 'en')
  await page.evaluate(decodeURIComponent(on!.replace(/^javascript:/, '')))
  await expect.poll(async () => (await readVerbs(page)).salts).toEqual(await verbSalts())

  await openElsewhere(page, 'en')
  await page.evaluate(decodeURIComponent(off!.replace(/^javascript:/, '')))
  await expect.poll(() => hasLoaded(page, 'Furifont Sans')).toBe(true)
  await page.waitForTimeout(300)
  expect((await readVerbs(page)).salts).toEqual([])
})

test('reads kanji by their okurigana in the playground as it is edited, and turns that off', async ({ page }) => {
  // The test font's reading list stands in for the prebuilt one's, so the salts are those verbSalts counts.
  const readings = await readFile(TEST_READINGS)
  await page.route(url => url.pathname.endsWith('/fonts/FurifontSansVF.ivs.json'), route => route.fulfill({ body: readings, contentType: 'application/json' }))
  await page.goto(new URL('/#/', url).href)
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Try it' }) })
  const text = section.getByRole('textbox')
  const salts = (): Promise<(string | undefined)[]> => text.locator('span').evaluateAll(spans => spans.map(span => (span as HTMLElement).dataset.salt))

  await text.fill('来ない、来ます')
  const [ko, ki] = (await verbSalts()).slice(0, 2)
  await expect.poll(salts).toEqual([ko, ki])
  expect(await text.textContent()).toBe('来ない、来ます')

  // The redraw puts the caret back where it was: the next character lands at the end.
  await text.press('End')
  await page.keyboard.type('X')
  await expect.poll(async () => text.textContent()).toBe('来ない、来ますX')
  await expect.poll(salts).toEqual([ko, ki])

  await section.locator('label', { has: page.getByRole('checkbox', { name: 'Okurigana readings' }) }).click()
  await expect.poll(salts).toEqual([])
  expect(await text.textContent()).toBe('来ない、来ますX')
})
