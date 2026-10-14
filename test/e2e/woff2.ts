/// <reference lib="dom" />
// A page script that compresses fonts as a web app would; setup.ts bundles it with Vite.
import { toWoff2 } from '@furifont/compiler'
import { brotli } from '@furifont/compiler/browser'

declare global {
  interface Window {
    toWoff2: (font: Uint8Array) => ReturnType<typeof toWoff2>
  }
}

window.toWoff2 = font => toWoff2(font, brotli)
