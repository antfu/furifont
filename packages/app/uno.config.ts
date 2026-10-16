import { defineConfig, presetIcons, presetWind4 } from 'unocss'

/**
 * Black and white, square corners, 1px guide lines. Every color is one of
 * five tokens, so light and dark stay in step.
 */
export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({ scale: 1.15 }),
  ],
  theme: {
    font: {
      furi: '"Furifont Sans", ui-sans-serif, system-ui, sans-serif',
    },
  },
  // A fixed line height ignores `--ff-lh`, which the Japanese text needs for its ruby.
  blocklist: [
    [/^leading-/, { message: selector => `\`${selector}\` is blocked: use \`lh-<n>\`, which multiplies the base line height \`--ff-lh\`.` }],
  ],
  rules: [
    // `ss01` is Furifont's own switch back to plain kanji, for text that must not carry ruby.
    ['no-ruby', { 'font-feature-settings': '"ss01"', 'line-height': '1' }],
    // `lh-1.5` is a line height of 1.5 times the base `--ff-lh`, which tokens.css raises where the text needs room for ruby.
    [/^lh-(\d+(?:\.\d+)?)$/, ([, n]) => ({ 'line-height': `calc(${n} * var(--ff-lh))` })],
  ],
  shortcuts: {
    'bg-base': 'bg-[var(--ff-bg)]',
    'bg-inverse': 'bg-[var(--ff-fg)]',
    'bg-hover': 'bg-[var(--ff-hover)]',
    'color-base': 'text-[var(--ff-fg)]',
    'color-inverse': 'text-[var(--ff-bg)]',
    'color-muted': 'text-[var(--ff-muted)]',
    'color-faint': 'text-[var(--ff-faint)]',
    'border-base': 'border-[var(--ff-line)]',
    'border-strong': 'border-[var(--ff-line-strong)]',
    // The foreground color, for a border around a filled (`bg-inverse`) element, or a focus that must stand out.
    'border-inverse': 'border-[var(--ff-fg)]',
    'label': 'font-mono text-[11px] lh-1.45 uppercase tracking-[0.12em] color-muted',
    'input': 'w-full rounded-none border border-base bg-transparent px-3 py-2 text-sm color-base no-ruby outline-none transition-colors placeholder:color-faint focus:border-inverse',
    'btn': 'inline-flex h-9 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-150 select-none disabled:cursor-not-allowed disabled:opacity-40',
    'btn-solid': 'btn border-inverse bg-inverse color-inverse hover:opacity-85',
    'btn-outline': 'btn border-strong color-base hover:border-inverse hover:bg-inverse hover:color-inverse',
    'btn-ghost': 'btn border-transparent color-muted hover:color-base hover:bg-hover',
    'focus-ring': 'focus-visible:outline-2 focus-visible:outline-[var(--ff-fg)] focus-visible:outline-offset-2',
    // Rendered Markdown: the docs pages.
    'prose': [
      'text-[15px] lh-1.625',
      '[&_h1]:(mb-8 text-4xl font-semibold tracking-[-0.03em])',
      '[&_h2]:(mb-4 mt-12 text-xl font-semibold)',
      '[&_h3]:(mb-3 mt-8 font-semibold)',
      '[&_p]:my-4',
      '[&_ul]:(my-4 list-disc pl-6) [&_ol]:(my-4 list-decimal pl-6) [&_li]:(my-1 max-w-[66ch])',
      '[&_a]:(underline underline-offset-3) [&_a:hover]:color-muted',
      '[&_code]:(bg-hover px-1 font-mono text-[0.9em])',
      '[&_pre]:(my-4 overflow-x-auto border border-base p-4 text-[13px] lh-1.85) [&_pre_code]:(bg-transparent p-0)',
      '[&_table]:(my-4 border-collapse text-sm) [&_th]:(border border-base px-3 py-2 text-left font-medium) [&_td]:(border border-base px-3 py-2)',
      '[&_blockquote]:(my-4 border-l-2 border-strong pl-4 color-muted)',
    ],
    // A bordered track that fills up to a square knob, like UiToggle. Firefox fills it
    // itself; WebKit has no progress part, so its track fills to `--slider-fraction`.
    // Each browser needs its own rules: one selector it does not know drops the whole rule.
    'slider': [
      'h-3.5 w-full cursor-pointer appearance-none bg-transparent focus-ring',
      '[&::-webkit-slider-runnable-track]:(h-1.5 box-border border border-solid border-strong [background:linear-gradient(var(--ff-fg),var(--ff-fg))_0_0/calc(7px_+_var(--slider-fraction)*(100%_-_14px))_100%_no-repeat])',
      '[&::-webkit-slider-thumb]:(-mt-[5px] size-3.5 box-border appearance-none border border-solid border-strong bg-base)',
      '[&::-moz-range-track]:(h-1.5 box-border border border-solid border-strong)',
      '[&::-moz-range-progress]:(h-1.5 bg-inverse)',
      '[&::-moz-range-thumb]:(size-3.5 box-border rounded-none border border-solid border-strong bg-base)',
    ],
  },
})
