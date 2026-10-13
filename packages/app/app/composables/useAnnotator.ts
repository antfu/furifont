import type { ReadingReference } from '@furifont/annotate'
import { createAnnotator } from '@furifont/annotate'

let tokenizer: Promise<Parameters<typeof createAnnotator>[0]> | undefined

/** gzip's magic number: still compressed, unless the server sent it with Content-Encoding. */
function isGzip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, 2)
  return head[0] === 0x1F && head[1] === 0x8B
}

/** kuromoji in the browser, its gzipped dictionary fetched once from `kuromoji/`. */
function loadTokenizer(base: string): NonNullable<typeof tokenizer> {
  return tokenizer ??= import('@patdx/kuromoji').then(({ TokenizerBuilder }) => new TokenizerBuilder({
    loader: {
      async loadArrayBuffer(file: string) {
        const response = await fetch(`${base}kuromoji/${file}`)
        if (!response.ok)
          throw new Error(`${file}: ${response.status}`)
        const bytes = await response.arrayBuffer()
        return isGzip(bytes) ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes
      },
    },
  }).build())
}

/** Writes the selectors that give verbs their reading, loading the analyzer on first use. */
export function useAnnotator(reference: Ref<ReadingReference | undefined>) {
  const base = useRuntimeConfig().app.baseURL
  const loading = ref(false)
  async function annotate(text: string): Promise<string> {
    if (!reference.value)
      return text
    loading.value = true
    try {
      return createAnnotator(await loadTokenizer(base), reference.value)(text)
    }
    finally {
      loading.value = false
    }
  }
  return { annotate, loading: readonly(loading) }
}
