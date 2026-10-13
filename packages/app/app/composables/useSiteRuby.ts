const STORAGE_KEY = 'furifont:ruby'

/** Whether the Japanese site shows its own ruby; the choice is remembered. */
export function useSiteRuby() {
  const ruby = useState('site-ruby', () => localStorage.getItem(STORAGE_KEY) !== 'false')
  // `no-ruby` on the page turns on `ss01` for everything that inherits the font settings.
  watchEffect(() => document.documentElement.classList.toggle('no-ruby', !ruby.value))
  function toggle(): void {
    ruby.value = !ruby.value
    localStorage.setItem(STORAGE_KEY, String(ruby.value))
  }
  return { ruby: readonly(ruby), toggle }
}
