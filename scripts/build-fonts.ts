/**
 * Builds the prebuilt fonts: hiragana and romaji ruby on Source Han Sans JP and
 * Source Han Serif JP.
 *
 *   node scripts/build-fonts.ts [outDir]   every weight, OpenType and WOFF2, for the release (default: dist/fonts)
 *   node scripts/build-fonts.ts --site     the Regular WOFF2s the site serves, into fonts/, which git keeps
 */
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, cwd } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildFont, FurifontConfigSchema } from 'furifont'
import * as v from 'valibot'

const site = argv[2] === '--site'
const outDir = site ? fileURLToPath(new URL('../fonts', import.meta.url)) : argv[2] ?? fileURLToPath(new URL('../dist/fonts', import.meta.url))
const families = [
  { family: 'Furifont Sans', rubyScript: 'hiragana', base: 'Source Han Sans JP' },
  { family: 'Furifont Sans Romaji', rubyScript: 'hepburn', base: 'Source Han Sans JP' },
  { family: 'Furifont Serif', rubyScript: 'hiragana', base: 'Source Han Serif JP' },
  { family: 'Furifont Serif Romaji', rubyScript: 'hepburn', base: 'Source Han Serif JP' },
] as const

// Fonts of families since dropped must not linger.
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
// The fonts are Source Han derivatives under the OFL; their rules come from CC BY-SA data.
await copyFile(new URL('../OFL.txt', import.meta.url), join(outDir, 'OFL.txt'))
await copyFile(new URL('../packages/dictionary/LICENSE.md', import.meta.url), join(outDir, 'DATA-LICENSE.md'))

for (const weight of site ? ['Regular'] : ['Regular', 'Bold']) {
  await Promise.all(families.map(async ({ base, ...family }) => {
    // The site loads WOFF2; git keeps no OpenType, which the release carries.
    const config = v.parse(FurifontConfigSchema, { ...family, base: `${base} ${weight}`, ...(site && { formats: ['woff2'] }) })
    const { files } = await buildFont(config, { cwd: cwd(), outDir })
    console.log(files.map(f => f.name).join('  '))
  }))
}
