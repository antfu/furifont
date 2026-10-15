import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as v from 'valibot'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFont, DEFAULTS, estimateFont, FurifontConfigSchema, loadConfig, PREBUILT } from '../src'

const BASE = fileURLToPath(new URL('../../compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))

let cwd: string
beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'furifont-cli-'))
})
afterAll(() => rm(cwd, { recursive: true, force: true }))

describe('pREBUILT', () => {
  it('makes a valid config for every font and weight, as build-fonts.ts does', () => {
    for (const { base, family, rubyScript } of PREBUILT.fonts) {
      for (const style of PREBUILT.weights.map(w => w.style)) {
        const config = v.parse(FurifontConfigSchema, { ...PREBUILT.options, family, rubyScript, base: `${base} ${style}` })
        expect(config).toMatchObject({ family, rubyScript, base: `${base} ${style}`, formats: [...DEFAULTS.build.formats] })
      }
    }
  })
})

describe('loadConfig', () => {
  it('fills defaults when there is no config file', async () => {
    const config = await loadConfig(cwd)
    expect(config).toMatchObject({ family: DEFAULTS.plan.family, base: DEFAULTS.build.base, rubyScript: DEFAULTS.plan.rubyScript, skip: DEFAULTS.plan.skip, formats: [...DEFAULTS.build.formats] })
  })

  it('names the file and the problem when the config is invalid', async () => {
    await writeFile(join(cwd, 'bad.json'), JSON.stringify({ rubyScript: 'cyrillic' }))
    await expect(loadConfig(cwd, 'bad.json')).rejects.toThrow(/bad\.json.*rubyScript/s)
  })

  it('refuses a version that a font revision cannot carry', async () => {
    await writeFile(join(cwd, 'version.json'), JSON.stringify({ version: '1.10.0' }))
    await expect(loadConfig(cwd, 'version.json')).rejects.toThrow(/version\.json.*version/s)
  })

  it('refuses a config that builds no format at all', async () => {
    await writeFile(join(cwd, 'none.json'), JSON.stringify({ formats: [] }))
    await expect(loadConfig(cwd, 'none.json')).rejects.toThrow(/none\.json.*formats/s)
  })
})

describe('buildFont', () => {
  it('writes the font, its WOFF2 and the selector reference, at the sizes estimated', async () => {
    const config = { ...await loadConfig(cwd), base: BASE }
    const [{ files, report }, estimate] = await Promise.all([buildFont(config, { cwd, outDir: join(cwd, 'fonts') }), estimateFont(config, cwd)])
    expect(files.map(f => f.name)).toEqual(['FurifontSans-Regular.otf', 'FurifontSans-Regular.woff2', 'FurifontSans-Regular.ivs.json'])
    const ivs = JSON.parse(await readFile(files[2]!.path, 'utf8'))
    expect(ivs.words['今日'][0]).toBe('今日[きょう]')
    expect(report.stats.patterns).toBeGreaterThan(0)
    expect(estimate.otf).toBe(files[0]!.bytes)
    expect(estimate.woff2 / files[1]!.bytes).toBeCloseTo(1, 1)
  })

  it('writes only the formats asked for', async () => {
    const outDir = join(cwd, 'woff2-only')
    const config = { ...await loadConfig(cwd), base: BASE, formats: ['woff2' as const] }
    const { files } = await buildFont(config, { cwd, outDir })
    expect(files.map(f => f.name)).toEqual(['FurifontSans-Regular.woff2', 'FurifontSans-Regular.ivs.json'])
    expect((await readdir(outDir)).sort()).toEqual(['FurifontSans-Regular.ivs.json', 'FurifontSans-Regular.woff2'])
  })
})
