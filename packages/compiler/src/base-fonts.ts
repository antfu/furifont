import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A font Furifont downloads on demand, named by family and style: `Source Han Serif JP Bold`. */
export interface BaseFont {
  name: string
  url: string
  /** Its file name in the cache. */
  file: string
}

function sourceHan(face: 'Sans' | 'Serif', weights: string[]): BaseFont[] {
  return weights.map(weight => ({
    name: `Source Han ${face} JP ${weight}`,
    url: `https://github.com/adobe-fonts/source-han-${face.toLowerCase()}/raw/release/SubsetOTF/JP/SourceHan${face}JP-${weight}.otf`,
    file: `SourceHan${face}JP-${weight}.otf`,
  }))
}

export const BASE_FONTS: readonly BaseFont[] = [
  ...sourceHan('Sans', ['ExtraLight', 'Light', 'Normal', 'Regular', 'Medium', 'Bold', 'Heavy']),
  ...sourceHan('Serif', ['ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Heavy']),
]

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
  const file = join(cacheDir, font.file)
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
