import type { FurifontConfigInput } from './config'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import process from 'node:process'
import { createAnnotator } from '@furifont/annotate'
import { RUBY_SCRIPTS } from '@furifont/core'
import { cac } from 'cac'
import * as v from 'valibot'
import pkg from '../package.json' with { type: 'json' }
import { buildFont, planWithBase } from './build'
import { CONFIG_FILE, FurifontConfigSchema, loadConfig } from './config'

const STUDIO_PAGE = '#/studio'

const cli = cac('furifont')

cli
  .command('build', 'Build a font into --out')
  .option('--config <file>', `Config file`, { default: CONFIG_FILE })
  .option('--base <font>', 'A font to download, such as "Source Han Serif JP Bold", or a font file')
  .option('--family <name>', 'Font family name')
  .option('--script <script>', `Ruby script: ${RUBY_SCRIPTS.join(', ')}`)
  .option('--nf <bucket>', 'Annotate words up to this newspaper frequency bucket (1-48)')
  .option('--out <dir>', 'Output directory', { default: 'fonts' })
  .action(async (flags: { config: string, base?: string, family?: string, script?: string, nf?: number, out: string }) => {
    const cwd = process.cwd()
    const overrides: FurifontConfigInput = {
      ...(flags.base && { base: flags.base }),
      ...(flags.family && { family: flags.family }),
      ...(flags.script && { rubyScript: v.parse(v.picklist(RUBY_SCRIPTS), flags.script) }),
      ...(flags.nf && { nfMax: Number(flags.nf) }),
    }
    const config = v.parse(FurifontConfigSchema, { ...await loadConfig(cwd, flags.config), ...overrides })
    const { files, report } = await buildFont(config, {
      cwd,
      outDir: flags.out,
      onProgress: ({ step, done, total }) => process.stderr.write(`\r${step}${total ? ` ${done}/${total}` : ''}`.padEnd(24)),
    })
    process.stderr.write('\r'.padEnd(24))
    const { stats } = report
    console.log(`\r${stats.patterns} words, ${stats.isolated} lone kanji, ${stats.glyphs} ruby glyphs`)
    for (const file of files)
      console.log(`  ${relative(cwd, file.path)}  ${(file.bytes / 1024 / 1024).toFixed(1)} MB`)
  })

const ReferenceSchema = v.object({
  kanji: v.record(v.string(), v.array(v.string())),
  words: v.record(v.string(), v.array(v.string())),
  lone: v.record(v.string(), v.string()),
})

async function readInput(file: string | undefined): Promise<string> {
  if (file)
    return readFile(file, 'utf8')
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin)
    chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

cli
  .command('annotate [file]', 'Write the selectors that give words their reading by their okurigana, and print the text')
  .option('--reference <file>', 'The .ivs.json of the font the text is for (default: planned from the config)')
  .option('--config <file>', 'Config file', { default: CONFIG_FILE })
  .action(async (file: string | undefined, flags: { reference?: string, config: string }) => {
    const cwd = process.cwd()
    const reference = flags.reference
      ? v.parse(ReferenceSchema, JSON.parse(await readFile(flags.reference, 'utf8')))
      : (await planWithBase(await loadConfig(cwd, flags.config), cwd)).report.ivs
    const { OKURIGANA } = await import('@furifont/dictionary/okurigana')
    const annotate = createAnnotator(OKURIGANA, reference)
    process.stdout.write(annotate(await readInput(file)))
  })

cli
  .command('dev', 'Open the studio to customize, preview and build fonts')
  .option('--port <port>', 'Port to listen on')
  .option('--host <host>', 'Host to bind, 0.0.0.0 to reach it from another machine', { default: 'localhost' })
  .option('--open', 'Open the studio in a browser', { default: true })
  .option('--auth', 'Ask for the one-time code printed here; --no-auth only on a machine you trust', { default: true })
  .action(async (flags: { port?: number, host: string, open: boolean, auth: boolean }) => {
    const [{ createDevServer }, { default: devframe }] = await Promise.all([import('devframe/adapters/dev'), import('./devframe')])
    await createDevServer(devframe, {
      host: flags.host,
      port: flags.port ? Number(flags.port) : undefined,
      openBrowser: flags.open && STUDIO_PAGE,
      auth: flags.auth ? undefined : false,
      // Off loopback the one-time code printed below still guards the studio.
      allowedOrigins: flags.host === 'localhost' ? undefined : false,
      onReady: ({ origin }) => console.log(`Furifont studio: ${origin}/${STUDIO_PAGE}`),
    })
  })

cli.help()
cli.version(pkg.version)
cli.parse(process.argv, { run: false })
await cli.runMatchedCommand()?.catch((error: Error) => {
  console.error(error.message)
  process.exitCode = 1
})
if (!cli.matchedCommand && !cli.options.help && !cli.options.version)
  cli.outputHelp()
