/**
 * Prepares a checkout for development: dependencies, the browsers the e2e tests
 * drive, and a first build.
 *
 *   pnpm run setup [--no-browsers]   (`pnpm setup` is pnpm's own command)
 */
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { parseArgs } from 'node:util'

const { values: flags } = parseArgs({ options: { 'no-browsers': { type: 'boolean' } } })

function run(command: string, args: string[]): boolean {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  return spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0
}

function fail(message: string): never {
  console.error(`\n${message}`)
  process.exit(1)
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18))
  fail(`Node ${process.versions.node} is too old: Furifont needs 22.18 or later.`)

if (!run('pnpm', ['install']))
  fail('pnpm install failed.')
if (!flags['no-browsers'] && !run('pnpm', ['exec', 'playwright', 'install', 'chromium', 'firefox', 'webkit']))
  fail('Installing the Playwright browsers failed. On Linux, `pnpm exec playwright install-deps` adds the system libraries they need.')
if (!run('pnpm', ['build']))
  fail('The first build failed.')

console.log('\nReady. Try `pnpm test`, `pnpm test:e2e` or `pnpm dev`.')
