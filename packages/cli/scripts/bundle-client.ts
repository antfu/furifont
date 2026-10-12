/**
 * Copies the generated app into `dist/client`, the studio's Devframe client.
 * Prebuilt fonts stay out: the studio serves the ones you build.
 */
import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../app/.output/public', import.meta.url))
const to = fileURLToPath(new URL('../dist/client', import.meta.url))

const fonts = join(from, 'fonts')

await rm(to, { recursive: true, force: true })
await cp(from, to, { recursive: true, filter: source => !source.startsWith(fonts) })
