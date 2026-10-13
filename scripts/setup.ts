/**
 * Prepares a checkout for development: dependencies, Python's font libraries,
 * the browsers the e2e tests drive, and a first build.
 *
 *   pnpm run setup [--no-browsers]   (`pnpm setup` is pnpm's own command)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

const REQUIREMENTS = 'packages/compiler/python/requirements.txt'
const VENV = '.venv'
const VENV_PYTHON = process.platform === 'win32' ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python')

const { values: flags } = parseArgs({ options: { 'no-browsers': { type: 'boolean' } } })

function run(command: string, args: string[]): boolean {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  return spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0
}

function succeeds(command: string, args: string[]): boolean {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0
}

function fail(message: string): never {
  console.error(`\n${message}`)
  process.exit(1)
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18))
  fail(`Node ${process.versions.node} is too old: Furifont needs 22.18 or later.`)

const candidates = [process.env.FURIFONT_PYTHON, VENV_PYTHON, 'python3', 'python'].filter(c => c !== undefined)
const python = candidates.find(c => succeeds(c, ['-c', 'import sys; sys.exit(sys.version_info < (3, 10))']))
if (!python)
  fail('Python 3.10 or later was not found. Install it, or point FURIFONT_PYTHON at one.')

const hasFontLibraries = (interpreter: string): boolean => succeeds(interpreter, ['-c', 'import fontTools, uharfbuzz, brotli'])
if (!hasFontLibraries(python) && !run(python, ['-m', 'pip', 'install', '-r', REQUIREMENTS])) {
  // Systems that manage their own Python (PEP 668) refuse a global install: use a virtual environment.
  if (!existsSync(VENV_PYTHON) && !run(python, ['-m', 'venv', VENV])) {
    rmSync(VENV, { recursive: true, force: true })
    fail(`Could not create ${VENV} (see above). Or install the font libraries yourself: ${python} -m pip install -r ${REQUIREMENTS}`)
  }
  // The compiler finds this .venv on its own.
  if (!run(VENV_PYTHON, ['-m', 'pip', 'install', '-r', REQUIREMENTS]))
    fail(`Installing ${REQUIREMENTS} into ${VENV} failed.`)
}

if (!run('pnpm', ['install']))
  fail('pnpm install failed.')
if (!flags['no-browsers'] && !run('pnpm', ['exec', 'playwright', 'install', 'chromium', 'firefox', 'webkit']))
  fail('Installing the Playwright browsers failed. On Linux, `pnpm exec playwright install-deps` adds the system libraries they need.')
if (!run('pnpm', ['build']))
  fail('The first build failed.')

console.log('\nReady. Try `pnpm test`, `pnpm test:e2e` or `pnpm dev`.')
