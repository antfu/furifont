const STORAGE_KEY = 'furifont:dark'

/** Follows the system until toggled; the choice is remembered. */
export function useDarkMode() {
  const dark = useState('dark-mode', () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? stored === 'true' : matchMedia('(prefers-color-scheme: dark)').matches
  })
  watchEffect(() => document.documentElement.classList.toggle('dark', dark.value))
  function toggle(): void {
    dark.value = !dark.value
    localStorage.setItem(STORAGE_KEY, String(dark.value))
  }
  return { dark: readonly(dark), toggle }
}
