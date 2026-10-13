import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BASE_FONTS, fetchBaseFont } from '../src'

const font = (name: string) => BASE_FONTS.find(f => f.name === name)!

let cacheDir: string
let downloads: string[]

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'furifont-cache-'))
  downloads = []
  vi.stubGlobal('fetch', async (url: string) => {
    downloads.push(url)
    await new Promise(resolve => setTimeout(resolve, 20))
    return new Response(new TextEncoder().encode('OTTO font bytes'))
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(cacheDir, { recursive: true, force: true })
})

it('downloads a font once when several builds ask for it at the same time', async () => {
  const paths = await Promise.all([1, 2, 3].map(() => fetchBaseFont(font('Source Han Sans JP Bold'), cacheDir)))
  expect(new Set(paths).size).toBe(1)
  expect(await readFile(paths[0]!, 'utf8')).toBe('OTTO font bytes')
  expect(await readdir(cacheDir)).toEqual(['SourceHanSansJP-Bold.otf'])
  expect(downloads).toHaveLength(1)
})

it('reuses a downloaded font', async () => {
  await fetchBaseFont(font('Source Han Serif JP Regular'), cacheDir)
  await fetchBaseFont(font('Source Han Serif JP Regular'), cacheDir)
  expect(downloads).toEqual(['https://github.com/adobe-fonts/source-han-serif/raw/release/SubsetOTF/JP/SourceHanSerifJP-Regular.otf'])
})
