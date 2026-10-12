/**
 * Declares the prebuilt families against the app's base URL, so the same build
 * finds `fonts/` on the demo site and next to the CLI's studio.
 */
export default defineNuxtPlugin(() => {
  const base = useRuntimeConfig().app.baseURL
  const css = FAMILIES.flatMap(({ family, stem }) => WEIGHTS.map(({ weight, style }) =>
    `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url("${base}fonts/${stem}-${style}.woff2") format("woff2")}`,
  )).join('\n')
  useHead({ style: [{ key: 'furifont-faces', innerHTML: css }] })
})
