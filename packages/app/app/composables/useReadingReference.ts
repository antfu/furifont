export interface ReadingReference {
  /** Kanji to its readings; VS242 picks the first. */
  kanji: Record<string, string[]>
  /** Word to its readings in inline notation; the first is the default. */
  words: Record<string, string[]>
  /** Kanji alone in its run to the reading it shows without a selector. */
  lone: Record<string, string>
}

/** The selector reference written next to the prebuilt fonts. */
export function useReadingReference() {
  const base = useRuntimeConfig().app.baseURL
  const reference = shallowRef<ReadingReference>()
  const error = ref<string>()
  onMounted(async () => {
    try {
      const response = await fetch(`${base}${fontPath(FAMILIES[0]!, 'ivs.json')}`)
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`)
      reference.value = await response.json()
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  })
  return { reference, error }
}
