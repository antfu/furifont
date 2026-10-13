import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'

const compress = promisify(brotliCompress)

/** Brotli in font mode with the largest window: what `toWoff2` needs. Lower `quality` trades size for speed. */
export function brotli(data: Uint8Array, quality: number = constants.BROTLI_MAX_QUALITY): Promise<Uint8Array> {
  return compress(data, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
      [constants.BROTLI_PARAM_QUALITY]: quality,
      [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  })
}

/** Compiles hb-subset from the installed harfbuzzjs; `compileFont` instantiates it once. */
export async function subsetWasm(): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await readFile(new URL(import.meta.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'))))
}
