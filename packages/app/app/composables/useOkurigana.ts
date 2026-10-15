import type { OkuriganaReader } from '@furifont/helper-web'
import type { MaybeRefOrGetter } from 'vue'
import { loadOkuriganaReader } from '@furifont/helper-web'

/**
 * Reads kanji by their okurigana (来 in 来ない) for a family's font. The reader
 * is there once the pairs and the font's reading lists have loaded, and stays
 * missing when they fail or the font predates `salt`: a bonus, never an error.
 */
export function useOkurigana(family: MaybeRefOrGetter<Family>) {
  const base = useRuntimeConfig().app.baseURL
  const reader = shallowRef<OkuriganaReader>()
  async function load(): Promise<void> {
    const picked = toValue(family)
    const loaded = await loadOkuriganaReader({ readings: `${base}${fontPath(picked, 'ivs.json')}`, pairs: `${base}okurigana.json` })
    // A newer pick of family wins.
    if (picked.stem === toValue(family).stem)
      reader.value = loaded
  }
  onMounted(load)
  watch(() => toValue(family).stem, load)
  return { reader }
}
