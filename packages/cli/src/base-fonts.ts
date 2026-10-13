import type { BaseFont } from '@furifont/compiler'
import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Downloads in flight, so builds asking for the same font at once share one. */
const downloads = new Map<string, Promise<string>>()

async function download(font: BaseFont, cacheDir: string, file: string): Promise<string> {
  await mkdir(cacheDir, { recursive: true })
  const response = await fetch(font.url)
  if (!response.ok)
    throw new Error(`Downloading ${font.name} failed: ${response.status} ${response.statusText}`)
  // Write beside, then move, so an interrupted download never looks complete.
  // The name is unique: another process may be downloading the same font.
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

/** Downloads a base font into `cacheDir` once, returning its path. */
export async function fetchBaseFont(font: BaseFont, cacheDir: string): Promise<string> {
  const file = join(cacheDir, basename(new URL(font.url).pathname))
  if (await access(file).then(() => true, () => false))
    return file
  // No await between the lookup and the set: a second caller must see the first's download.
  let pending = downloads.get(file)
  if (!pending) {
    pending = download(font, cacheDir, file).finally(() => downloads.delete(file))
    downloads.set(file, pending)
  }
  return pending
}
