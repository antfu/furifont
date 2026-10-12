import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SOURCE_HAN_SANS_JP_WEIGHTS = ['ExtraLight', 'Light', 'Normal', 'Regular', 'Medium', 'Bold', 'Heavy'] as const
export type SourceHanSansWeight = typeof SOURCE_HAN_SANS_JP_WEIGHTS[number]

const RELEASE = 'https://github.com/adobe-fonts/source-han-sans/raw/release/SubsetOTF/JP'

/** Downloads in flight, so builds asking for the same weight at once share one. */
const downloads = new Map<string, Promise<string>>()

async function download(weight: SourceHanSansWeight, cacheDir: string, file: string): Promise<string> {
  await mkdir(cacheDir, { recursive: true })
  const response = await fetch(`${RELEASE}/SourceHanSansJP-${weight}.otf`)
  if (!response.ok)
    throw new Error(`Downloading Source Han Sans JP ${weight} failed: ${response.status} ${response.statusText}`)
  // Write beside, then move, so an interrupted download never looks complete.
  // The name is unique: another process may be downloading the same weight.
  const part = `${file}.${randomUUID()}.part`
  try {
    await writeFile(part, new Uint8Array(await response.arrayBuffer()))
    await rename(part, file)
  }
  finally {
    await rm(part, { force: true })
  }
  return file
}

/** Downloads a Source Han Sans JP weight into `cacheDir` once, returning its path. */
export async function fetchBaseFont(weight: SourceHanSansWeight, cacheDir: string): Promise<string> {
  const file = join(cacheDir, `SourceHanSansJP-${weight}.otf`)
  if (await access(file).then(() => true, () => false))
    return file
  // No await between the lookup and the set: a second caller must see the first's download.
  let pending = downloads.get(file)
  if (!pending) {
    pending = download(weight, cacheDir, file).finally(() => downloads.delete(file))
    downloads.set(file, pending)
  }
  return pending
}
