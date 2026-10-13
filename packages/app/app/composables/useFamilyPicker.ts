import { useI18n } from 'vue-i18n'

/** Typeface and ruby script, the options to pick them from, and the prebuilt family they make. */
export function useFamilyPicker() {
  const { t } = useI18n()
  const face = ref<Family['face']>('sans')
  const script = ref<Family['script']>('hiragana')
  // Every face comes in every script.
  const family = computed(() => FAMILIES.find(f => f.face === face.value && f.script === script.value)!)
  const faces = computed(() => (['sans', 'serif'] as const).map(value => ({ value, label: t(`faces.${value}`) })))
  const scripts = computed(() => (['hiragana', 'hepburn'] as const).map(value => ({ value, label: t(`scripts.${value}`) })))
  return { face, script, family, faces, scripts }
}
