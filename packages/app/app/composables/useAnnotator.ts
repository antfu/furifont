import type { ReadingReference } from '@furifont/annotate'
import { createAnnotator } from '@furifont/annotate'

/** Writes the selectors that okurigana decide, loading the dictionary's pairs on first use. */
export function useAnnotator(reference: Ref<ReadingReference | undefined>) {
  const loading = ref(false)
  async function annotate(text: string): Promise<string> {
    if (!reference.value)
      return text
    loading.value = true
    try {
      const { OKURIGANA } = await import('@furifont/dictionary/okurigana')
      return createAnnotator(OKURIGANA, reference.value)(text)
    }
    finally {
      loading.value = false
    }
  }
  return { annotate, loading: readonly(loading) }
}
