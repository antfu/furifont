/**
 * Builds the prebuilt fonts: three ruby scripts, two weights of Source Han Sans JP.
 *
 *   node scripts/build-fonts.ts [outDir]   (default: packages/app/public/fonts)
 */
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

for (const base of ['Regular', 'Bold']) {
  await Promise.all(families.map(async (family) => {
    const config = v.parse(FurifontConfigSchema, { ...family, base })
    const { files } = await buildFont(config, { cwd: cwd(), outDir })
    console.log(files.map(f => f.name).join('  '))
  }))
}
