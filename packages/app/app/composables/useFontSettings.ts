import { useI18n } from 'vue-i18n'

/** One value for the whole site, remembered under `key`. */
function useRemembered<T extends string | boolean>(key: string, parse: (stored: string | null) => T) {
  const state = useState(key, () => parse(localStorage.getItem(key)))
  return computed({
    get: () => state.value,
    set: (value: T) => {
      state.value = value
      localStorage.setItem(key, String(value))
    },
  })
}

/** The visitor's typeface, ruby script, furigana and okurigana readings, shared by every demo and the Japanese interface; the choice is remembered. */
export function useFontSettings() {
  const { t } = useI18n()
  const face = useRemembered<Family['face']>('furifont:face', stored => stored === 'serif' ? 'serif' : 'sans')
  const script = useRemembered<Family['script']>('furifont:script', stored => stored === 'hepburn' ? 'hepburn' : 'hiragana')
  const ruby = useRemembered('furifont:ruby', stored => stored !== 'false')
  const okurigana = useRemembered('furifont:okurigana', stored => stored !== 'false')
  // Every face comes in every script.
  const family = computed(() => FAMILIES.find(f => f.face === face.value && f.script === script.value)!)
  const faces = computed(() => (['sans', 'serif'] as const).map(value => ({ value, label: t(`faces.${value}`) })))
  const scripts = computed(() => (['hiragana', 'hepburn'] as const).map(value => ({ value, label: t(`scripts.${value}`) })))
  return { face, script, ruby, okurigana, family, faces, scripts }
}
