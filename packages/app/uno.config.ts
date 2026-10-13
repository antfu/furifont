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
      furi: '"Furifont Sans JP", ui-sans-serif, system-ui, sans-serif',
    },
  },
  rules: [
    ['bg-grid', {
      'background-image': 'linear-gradient(var(--ff-line) 1px, transparent 1px), linear-gradient(90deg, var(--ff-line) 1px, transparent 1px)',
      'background-size': '32px 32px',
      'background-position': '-1px -1px',
    }],
  ],
  shortcuts: {
    'bg-base': 'bg-[var(--ff-bg)]',
    'bg-inverse': 'bg-[var(--ff-fg)]',
    'bg-hover': 'bg-[var(--ff-hover)]',
    'color-base': 'text-[var(--ff-fg)]',
    'color-inverse': 'text-[var(--ff-bg)]',
    'color-muted': 'text-[var(--ff-muted)]',
    'border-base': 'border-[var(--ff-line)]',
    'border-strong': 'border-[var(--ff-fg)]',
    'label': 'font-mono text-[11px] leading-4 uppercase tracking-[0.12em] color-muted',
    'input': 'w-full rounded-none border border-base bg-transparent px-3 py-2 text-sm color-base outline-none transition-colors placeholder:color-muted focus:border-strong',
    'btn': 'inline-flex h-9 items-center justify-center gap-2 border px-4 text-sm font-medium transition-colors duration-150 select-none disabled:cursor-not-allowed disabled:opacity-40',
    'btn-solid': 'btn border-strong bg-inverse color-inverse hover:opacity-85',
    'btn-outline': 'btn border-strong color-base hover:bg-inverse hover:color-inverse',
    'btn-ghost': 'btn border-transparent color-muted hover:color-base hover:bg-hover',
    'focus-ring': 'focus-visible:outline-2 focus-visible:outline-[var(--ff-fg)] focus-visible:outline-offset-2',
  },
})
