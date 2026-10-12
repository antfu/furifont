import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SOURCE_HAN_SANS_JP_WEIGHTS = ['ExtraLight', 'Light', 'Normal', 'Regular', 'Medium', 'Bold', 'Heavy'] as const
export type SourceHanSansWeight = typeof SOURCE_HAN_SANS_JP_WEIGHTS[number]

const RELEASE = 'https://github.com/adobe-fonts/source-han-sans/raw/release/SubsetOTF/JP'

/** Downloads a Source Han Sans JP weight into `cacheDir` once, returning its path. */
export async function fetchBaseFont(weight: SourceHanSansWeight, cacheDir: string): Promise<string> {
  const file = join(cacheDir, `SourceHanSansJP-${weight}.otf`)
  if (await access(file).then(() => true, () => false))
    return file
  const response = await fetch(`${RELEASE}/SourceHanSansJP-${weight}.otf`)
  if (!response.ok)
    throw new Error(`Downloading Source Han Sans JP ${weight} failed: ${response.status} ${response.statusText}`)
  await mkdir(cacheDir, { recursive: true })
  // Write beside, then move, so an interrupted download never looks complete.
  await writeFile(`${file}.part`, new Uint8Array(await response.arrayBuffer()))
  await rename(`${file}.part`, file)
  return file
}
