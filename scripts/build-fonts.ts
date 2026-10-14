/**
 * Builds the prebuilt fonts: hiragana and romaji ruby on Source Han Sans JP and
 * Source Han Serif JP, each as Regular, Bold and a variable font of every weight.
 *
 *   node scripts/build-fonts.ts [outDir]   all of them, OpenType and WOFF2, for the release (default: dist/fonts)
 *   node scripts/build-fonts.ts --site     the variable WOFF2s the site serves, into fonts/, which git keeps
 */
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, cwd } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildFont, FurifontConfigSchema, PREBUILT } from 'furifont'
import * as v from 'valibot'

const site = argv[2] === '--site'
const outDir = site ? fileURLToPath(new URL('../fonts', import.meta.url)) : argv[2] ?? fileURLToPath(new URL('../dist/fonts', import.meta.url))

// Fonts of families since dropped must not linger.
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
// The fonts are Source Han derivatives under the OFL; their rules come from CC BY-SA data.
await copyFile(new URL('../OFL.txt', import.meta.url), join(outDir, 'OFL.txt'))
await copyFile(new URL('../packages/dictionary/LICENSE.md', import.meta.url), join(outDir, 'DATA-LICENSE.md'))

// What is built, and how, is in PREBUILT: the families, weights and options.
const { variable } = PREBUILT
for (const style of site ? PREBUILT.site.styles : [...PREBUILT.weights.map(w => w.style), variable.style]) {
  await Promise.all(PREBUILT.fonts.map(async ({ base, family, rubyScript }) => {
    // The variable family is named apart, as Source Han's is, so it can be installed beside the static ones.
    const name = style === variable.style ? `${family} ${variable.style}` : family
    // The site loads WOFF2; git keeps no OpenType, which the release carries.
    const config = v.parse(FurifontConfigSchema, { ...PREBUILT.options, family: name, rubyScript, base: `${base} ${style}`, ...(site && { formats: [...PREBUILT.site.formats] }) })
    const { files } = await buildFont(config, { cwd: cwd(), outDir })
    console.log(files.map(f => f.name).join('  '))
  }))
}
