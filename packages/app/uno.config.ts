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
  rules: [
    // `ss01` is Furifont's own switch back to plain kanji, for text that must not carry ruby.
    ['no-ruby', { 'font-feature-settings': '"ss01"', 'line-height': '1' }],
  ],
  shortcuts: {
    'bg-base': 'bg-[var(--ff-bg)]',
    'bg-inverse': 'bg-[var(--ff-fg)]',
    'bg-hover': 'bg-[var(--ff-hover)]',
    'color-base': 'text-[var(--ff-fg)]',
    'color-inverse': 'text-[var(--ff-bg)]',
    'color-muted': 'text-[var(--ff-muted)]',
    'border-base': 'border-[var(--ff-line)]',
    'border-strong': 'border-[var(--ff-line-strong)]',
    // The foreground color, for a border around a filled (`bg-inverse`) element, or a focus that must stand out.
    'border-inverse': 'border-[var(--ff-fg)]',
    'label': 'font-mono text-[11px] leading-4 uppercase tracking-[0.12em] color-muted',
    'input': 'w-full rounded-none border border-base bg-transparent px-3 py-2 text-sm color-base outline-none transition-colors placeholder:color-muted focus:border-inverse',
    'btn': 'inline-flex h-9 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-150 select-none disabled:cursor-not-allowed disabled:opacity-40',
    'btn-solid': 'btn border-inverse bg-inverse color-inverse hover:opacity-85',
    'btn-outline': 'btn border-strong color-base hover:border-inverse hover:bg-inverse hover:color-inverse',
    'btn-ghost': 'btn border-transparent color-muted hover:color-base hover:bg-hover',
    'focus-ring': 'focus-visible:outline-2 focus-visible:outline-[var(--ff-fg)] focus-visible:outline-offset-2',
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
