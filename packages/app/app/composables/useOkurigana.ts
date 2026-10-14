import type { MaybeRefOrGetter } from 'vue'

/** Files by URL, so a family switch or a second playground does not fetch them again. */
const files = new Map<string, Promise<unknown>>()

function fetchJson(url: string): Promise<unknown> {
  let file = files.get(url)
  if (!file) {
    file = fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(url)))
    // So the next try loads it again.
    file.catch(() => files.delete(url))
    files.set(url, file)
  }
  return file
}

/**
 * Reads kanji by their okurigana (来 in 来ない) for a family's font. The reader
 * is there once the pairs and the font's reading lists have loaded, and stays
 * missing when they fail or the font predates `salt`: a bonus, never an error.
 */
export function useOkurigana(family: MaybeRefOrGetter<Family>) {
  const base = useRuntimeConfig().app.baseURL
  const reader = shallowRef<OkuriganaReader>()
  async function load(): Promise<void> {
    const { stem } = toValue(family)
    try {
      const [list, pairs] = await Promise.all([fetchJson(`${base}fonts/${stem}VF.ivs.json`), fetchJson(`${base}okurigana.json`)]) as [{ kanji: OkuriganaTables['readings'], words: OkuriganaTables['words'], lone: OkuriganaTables['lone'], salt?: boolean }, OkuriganaTables['pairs']]
      // A newer pick of family wins.
      if (stem === toValue(family).stem)
        reader.value = list.salt === true ? createOkuriganaReader({ pairs, readings: list.kanji, words: list.words, lone: list.lone }) : undefined
    }
    catch {
      reader.value = undefined
    }
  }
  onMounted(load)
  watch(() => toValue(family).stem, load)
  return { reader }
}
