/**
 * Downloads the fonts the site serves, the variable WOFF2s and their `.ivs.json`,
 * from the GitHub Release of this version into `.cache/fonts/v<version>`, which
 * the app serves at `/fonts`. A file already there is kept: assets don't change.
 *
 *   node scripts/fetch-fonts.ts
 */
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from '../package.json' with { type: 'json' }
// From source: the site's build runs this before any package is built.
import { PREBUILT } from '../packages/core/src/defaults.ts'

const tag = `v${pkg.version}`
const outDir = fileURLToPath(new URL(`../.cache/fonts/${tag}`, import.meta.url))
const files = ['OFL.txt', 'DATA-LICENSE.md', ...PREBUILT.fonts.flatMap(({ family }) => {
  const stem = `${family.replaceAll(' ', '')}${PREBUILT.variable.style}`
  return [`${stem}.woff2`, `${stem}.ivs.json`]
})]

await mkdir(outDir, { recursive: true })
await Promise.all(files.map(async (file) => {
  const path = join(outDir, file)
  if (await access(path).then(() => true, () => false))
    return
  const url = `https://github.com/antfu/furifont/releases/download/${tag}/${file}`
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`${url}: ${response.status} ${response.statusText}. The release workflow attaches the fonts a few minutes after the tag.`)
  // Written beside, then moved, so an interrupted download never looks complete.
  await writeFile(`${path}.part`, new Uint8Array(await response.arrayBuffer()))
  await rename(`${path}.part`, path)
  console.log(file)
}))
