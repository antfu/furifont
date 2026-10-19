/**
 * Builds the prebuilt fonts the release carries: hiragana and romaji ruby on
 * Source Han Sans JP and Source Han Serif JP, each as Regular and a variable
 * font of every weight, OpenType and WOFF2.
 *
 *   node scripts/build-fonts.ts [outDir]   (default: dist/fonts)
 */
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, cwd } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildFont, FurifontConfigSchema, PREBUILT } from 'furifont'
import * as v from 'valibot'

const outDir = argv[2] ?? fileURLToPath(new URL('../dist/fonts', import.meta.url))

// Fonts of families since dropped must not linger.
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
// The fonts are Source Han derivatives under the OFL; their rules come from CC BY-SA data.
await copyFile(new URL('../OFL.txt', import.meta.url), join(outDir, 'OFL.txt'))
await copyFile(new URL('../packages/dictionary/LICENSE.md', import.meta.url), join(outDir, 'DATA-LICENSE.md'))

// What is built, and how, is in PREBUILT: the families, weights and options.
const { variable } = PREBUILT
const total = (PREBUILT.weights.length + 1) * PREBUILT.fonts.length
const started = performance.now()
let finished = 0
let totalBytes = 0

const seconds = (since: number): string => `${((performance.now() - since) / 1000).toFixed(1)}s`
const size = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`

console.log(`Building ${total} fonts into ${outDir}`)
for (const style of [...PREBUILT.weights.map(w => w.style), variable.style]) {
  await Promise.all(PREBUILT.fonts.map(async ({ base, family, furiganaScript }) => {
    // The variable family is named apart, as Source Han's is, so it can be installed beside the static ones.
    const name = style === variable.style ? `${family} ${variable.style}` : family
    const label = style === variable.style ? name : `${name} ${style}`
    const config = v.parse(FurifontConfigSchema, { ...PREBUILT.options, family: name, furiganaScript, base: `${base} ${style}` })
    const begun = performance.now()
    console.log(`[start] ${label} (${furiganaScript}, base ${config.base})`)
    let step = ''
    const { files, report } = await buildFont(config, {
      cwd: cwd(),
      outDir,
      onProgress: (p) => {
        if (p.step === step)
          return
        step = p.step
        console.log(`[${label}] ${p.step}${p.total == null ? '' : ` (${p.total})`} +${seconds(begun)}`)
      },
    })
    const bytes = files.reduce((sum, f) => sum + f.bytes, 0)
    totalBytes += bytes
    finished++
    const { stats } = report
    console.log(`[done ${finished}/${total}] ${label} in ${seconds(begun)}: ${stats.rules} rules, ${stats.glyphs} glyphs, ${stats.protectedAnnotated} annotated + ${stats.protectedBare} bare words`)
    for (const f of files)
      console.log(`  ${f.name.padEnd(48)} ${size(f.bytes).padStart(10)}`)
  }))
}
console.log(`Built ${finished} fonts, ${size(totalBytes)} in total, in ${seconds(started)}`)
