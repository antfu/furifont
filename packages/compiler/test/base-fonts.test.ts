import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchBaseFont } from '../src'

let cacheDir: string
let downloads: number

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'furifont-cache-'))
  downloads = 0
  vi.stubGlobal('fetch', async () => {
    downloads++
    await new Promise(resolve => setTimeout(resolve, 20))
    return new Response(new TextEncoder().encode('OTTO font bytes'))
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(cacheDir, { recursive: true, force: true })
})

it('downloads a weight once when several builds ask for it at the same time', async () => {
  const paths = await Promise.all([1, 2, 3].map(() => fetchBaseFont('Bold', cacheDir)))
  expect(new Set(paths).size).toBe(1)
  expect(await readFile(paths[0]!, 'utf8')).toBe('OTTO font bytes')
  expect(await readdir(cacheDir)).toEqual(['SourceHanSansJP-Bold.otf'])
  expect(downloads).toBe(1)
})

it('reuses a downloaded weight', async () => {
  await fetchBaseFont('Regular', cacheDir)
  await fetchBaseFont('Regular', cacheDir)
  expect(downloads).toBe(1)
})
