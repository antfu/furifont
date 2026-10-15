/**
 * Declares the prebuilt families against the app's base URL, so the same build
 * finds `fonts/` on the demo site and next to the CLI's customize. The overrides
 * center the em box in the line: the font's own metrics reserve room above for
 * the ruby, which would sit text lower than icons next to it.
 */
export default defineNuxtPlugin(() => {
  const base = useRuntimeConfig().app.baseURL
  const css = FAMILIES.map(({ family, stem }) =>
    `@font-face{font-family:"${family}";font-display:swap;font-weight:250 900;ascent-override:88%;descent-override:12%;line-gap-override:0%;src:url("${base}fonts/${stem}VF.woff2") format("woff2")}`,
  ).join('\n')
  useHead({ style: [{ key: 'furifont-faces', innerHTML: css }] })
})
