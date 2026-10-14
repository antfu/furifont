/**
 * Brotli for `toWoff2` in a browser: the browser's own where it has one, else
 * brotli-wasm (an optional peer dependency), loaded on first use, as Chrome has
 * no Brotli compression stream. Neither takes WOFF2's font mode and largest
 * window, so a full font comes out about 10% larger than Node's.
 */
export async function brotli(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  // It takes any format name and throws on those it lacks; TypeScript's DOM types do not list "brotli" yet.
  const Compression = CompressionStream as new (format: string) => CompressionStream
  let stream: CompressionStream
  try {
    stream = new Compression('brotli')
  }
  catch {
    const { compress } = await (await import('brotli-wasm')).default
    return compress(data, { quality: 11 })
  }
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer())
}

/** Compiles hb-subset from where the bundler puts harfbuzzjs' file; `compileFont` instantiates it once. */
export async function subsetWasm(): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await (await fetch(new URL('harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url))).arrayBuffer())
}
