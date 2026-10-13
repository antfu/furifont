import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFont, loadConfig } from '../src'

const BASE = fileURLToPath(new URL('../../compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))

let cwd: string
beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'furifont-cli-'))
})
afterAll(() => rm(cwd, { recursive: true, force: true }))

describe('loadConfig', () => {
  it('fills defaults when there is no config file', async () => {
    const config = await loadConfig(cwd)
    expect(config).toMatchObject({ family: 'Furifont Sans', base: 'Source Han Sans JP Regular', rubyScript: 'hiragana', nfMax: 30 })
  })

  it('names the file and the problem when the config is invalid', async () => {
    await writeFile(join(cwd, 'bad.json'), JSON.stringify({ rubyScript: 'cyrillic' }))
    await expect(loadConfig(cwd, 'bad.json')).rejects.toThrow(/bad\.json.*rubyScript/s)
  })
})

describe('buildFont', () => {
  it('writes the font, its WOFF2 and the selector reference', async () => {
    const config = await loadConfig(cwd)
    const { files, report } = await buildFont({ ...config, base: BASE }, { cwd, outDir: join(cwd, 'fonts') })
    expect(files.map(f => f.name)).toEqual(['FurifontSans-Regular.otf', 'FurifontSans-Regular.woff2', 'FurifontSans-Regular.ivs.json'])
    const ivs = JSON.parse(await readFile(files[2]!.path, 'utf8'))
    expect(ivs.words['今日'][0]).toBe('今日[きょう]')
    expect(report.stats.patterns).toBeGreaterThan(0)
  })
})
