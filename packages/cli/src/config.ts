import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DEFAULTS, PlanOptionsSchema, withNfWindow } from '@furifont/core'
import * as v from 'valibot'

export const CONFIG_FILE = 'furifont.config.json'

/** The fonts a build can write. */
export const FONT_FORMATS = ['otf', 'woff2'] as const

export const FurifontConfigSchema = withNfWindow(v.object({
  ...PlanOptionsSchema.entries,
  /** A Source Han Sans JP weight (downloaded once), or the path of another OpenType font. */
  base: v.optional(v.pipe(v.string(), v.nonEmpty()), DEFAULTS.build.base),
  /** The fonts a build writes, beside the selector reference `.ivs.json`. */
  formats: v.optional(v.pipe(v.array(v.picklist(FONT_FORMATS)), v.minLength(1)), () => [...DEFAULTS.build.formats]),
}))
export type FurifontConfig = v.InferOutput<typeof FurifontConfigSchema>
export type FurifontConfigInput = v.InferInput<typeof FurifontConfigSchema>

/** Reads `furifont.config.json` from `cwd` (or `path`), filling in every default. */
export async function loadConfig(cwd: string, path = CONFIG_FILE): Promise<FurifontConfig> {
  const file = resolve(cwd, path)
  const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' && path === CONFIG_FILE)
      return '{}'
    throw error
  })
  const result = v.safeParse(FurifontConfigSchema, JSON.parse(text))
  if (!result.success)
    throw new Error(`${file}: ${v.summarize(result.issues)}`)
  return result.output
}
