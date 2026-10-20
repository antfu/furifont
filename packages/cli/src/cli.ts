import type { FurifontConfigInput } from './config'
import { relative } from 'node:path'
import process from 'node:process'
import { FURIGANA_SCRIPTS } from '@furifont/core'
import { cac } from 'cac'
import * as v from 'valibot'
import pkg from '../package.json' with { type: 'json' }
import { buildFont } from './build'
import { CONFIG_FILE, FONT_FORMATS, FurifontConfigSchema, loadConfig } from './config'

const STUDIO_PAGE = 'customize'

const cli = cac('furifont')

cli
  .command('build', 'Build a font into --out')
  .option('--config <file>', `Config file`, { default: CONFIG_FILE })
  .option('--base <font>', 'A font to download, such as "Source Han Serif JP Bold", or a font file')
  .option('--family <name>', 'Font family name')
  .option('--script <script>', `Furigana script: ${FURIGANA_SCRIPTS.join(', ')}`)
  .option('--take <words>', 'Annotate this many words, the most common first, or "max" for as many as the base font has glyphs for')
  .option('--formats <list>', `Fonts to write, comma-separated: ${FONT_FORMATS.join(', ')}`)
  .option('--out <dir>', 'Output directory', { default: 'fonts' })
  .action(async (flags: { config: string, base?: string, family?: string, script?: string, take?: number | string, formats?: string, out: string }) => {
    const cwd = process.cwd()
    const overrides: FurifontConfigInput = {
      ...(flags.base && { base: flags.base }),
      ...(flags.family && { family: flags.family }),
      ...(flags.script && { furiganaScript: v.parse(v.picklist(FURIGANA_SCRIPTS), flags.script) }),
      ...(flags.take && { take: flags.take === 'max' ? 'max' as const : Number(flags.take) }),
      ...(flags.formats && { formats: v.parse(v.array(v.picklist(FONT_FORMATS)), flags.formats.split(',')) }),
    }
    const config = v.parse(FurifontConfigSchema, { ...await loadConfig(cwd, flags.config), ...overrides })
    const { files, report } = await buildFont(config, {
      cwd,
      outDir: flags.out,
      onProgress: ({ step, done, total }) => process.stderr.write(`\r${step}${total ? ` ${done}/${total}` : ''}`.padEnd(24)),
    })
    process.stderr.write('\r'.padEnd(24))
    const { stats } = report
    console.log(`\r${stats.patterns} words, ${stats.isolated} lone kanji, ${stats.glyphs} furigana glyphs`)
    for (const file of files)
      console.log(`  ${relative(cwd, file.path)}  ${(file.bytes / 1024 / 1024).toFixed(1)} MB`)
  })

cli
  .command('dev', 'Open the studio to customize, preview and build fonts')
  .option('--port <port>', 'Port to listen on')
  .option('--host <host>', 'Host to bind, 0.0.0.0 to reach it from another machine', { default: 'localhost' })
  .option('--open', 'Open the studio in a browser', { default: true })
  .option('--auth', 'Ask for the one-time code printed here; --no-auth only on a machine you trust', { default: true })
  .action(async (flags: { port?: number, host: string, open: boolean, auth: boolean }) => {
    const [{ createDevServer }, { createInteractiveAuth }, { default: devframe }] = await Promise.all([
      import('devframe/adapters/dev'),
      import('devframe/recipes/interactive-auth'),
      import('./devframe'),
    ])
    await createDevServer(devframe, {
      host: flags.host,
      port: flags.port ? Number(flags.port) : undefined,
      openBrowser: flags.open && STUDIO_PAGE,
      // The printed link opens the studio, the only page that takes its code.
      // eslint-disable-next-line slop/no-chained-type-assertions -- `createDevServer` hands `auth` to the instance, which takes a factory too, but its type leaves that out.
      auth: flags.auth && ((ctx: Parameters<typeof createInteractiveAuth>[0]) =>
        createInteractiveAuth(ctx, { serverUrl: () => `${ctx.host.resolveOrigin()}/${STUDIO_PAGE}` })) as unknown as ReturnType<typeof createInteractiveAuth>,
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
