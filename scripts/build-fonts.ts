/**
 * Builds the prebuilt fonts: three ruby scripts, two weights of Source Han Sans JP.
 *
 *   node scripts/build-fonts.ts [outDir]   (default: packages/app/public/fonts)
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { argv, cwd } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildFont, FurifontConfigSchema } from 'furifont'
import * as v from 'valibot'

const outDir = argv[2] ?? fileURLToPath(new URL('../packages/app/public/fonts', import.meta.url))
const families = [
  { family: 'Furifont Sans JP', rubyScript: 'hiragana' },
  { family: 'Furifont Sans JP Kata', rubyScript: 'katakanaOn' },
  { family: 'Furifont Sans JP Romaji', rubyScript: 'hepburn' },
] as const

// The fonts are Source Han Sans derivatives under the OFL; their rules come from CC BY-SA data.
await mkdir(outDir, { recursive: true })
await copyFile(new URL('../OFL.txt', import.meta.url), join(outDir, 'OFL.txt'))
await copyFile(new URL('../packages/dictionary/LICENSE.md', import.meta.url), join(outDir, 'DATA-LICENSE.md'))

for (const base of ['Regular', 'Bold']) {
  await Promise.all(families.map(async (family) => {
    const config = v.parse(FurifontConfigSchema, { ...family, base: `Source Han Sans JP ${base}` })
    const { files } = await buildFont(config, { cwd: cwd(), outDir })
    console.log(files.map(f => f.name).join('  '))
  }))
}
