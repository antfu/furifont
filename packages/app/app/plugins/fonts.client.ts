/**
 * Declares the prebuilt families against the app's base URL, so the same build
 * finds `fonts/` on the demo site and next to the CLI's studio.
 */
export default defineNuxtPlugin(() => {
  const base = useRuntimeConfig().app.baseURL
  const css = FAMILIES.map(({ family, stem }) =>
    `@font-face{font-family:"${family}";font-display:swap;src:url("${base}fonts/${stem}-Regular.woff2") format("woff2")}`,
  ).join('\n')
  useHead({ style: [{ key: 'furifont-faces', innerHTML: css }] })
})
