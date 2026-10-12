import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import pkg from '../package.json' with { type: 'json' }
import { setupStudio, STUDIO_ID } from './studio'

/** The studio: the app's SPA, built into `dist/client`, talking to the RPC functions of `studio.ts`. */
export default defineDevframe({
  id: STUDIO_ID,
  name: 'Furifont',
  version: pkg.version,
  packageName: pkg.name,
  description: pkg.description,
  homepage: pkg.homepage,
  icon: 'ph:text-aa-duotone',
  clientAssets: fileURLToPath(new URL('./client', import.meta.url)),
  importMetaUrl: import.meta.url,
  cli: { command: 'furifont', port: 7392 },
  setup: setupStudio,
})
