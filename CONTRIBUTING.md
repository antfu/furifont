# Contributing

Thanks for helping. For the general conventions, see [antfu/contribute](https://github.com/antfu/contribute). This page covers what is specific to Furifont.

## Setup

You need:

- Node 22.18 or later.
- pnpm, through `corepack enable`.

Then run:

```sh
pnpm run setup
```

`pnpm setup` is pnpm's own command, so type `run`. The script does four things:

1. It checks your Node version.
2. It runs `pnpm install`.
3. It installs Chromium, Firefox and WebKit for the browser tests. Add `--no-browsers` to skip about 500 MB of downloads. On Linux, the browsers can also need system libraries: `pnpm exec playwright install-deps`.
4. It builds every package. `pnpm dev` and the browser tests need that build.

The first font build downloads Source Han Sans JP into `~/.cache/furifont`.

## Everyday commands

| Command | |
| --- | --- |
| `pnpm dev` | The app on `localhost:3000`, with the studio on live RPC and the fonts of this version's release, downloaded once into `.cache/fonts`. Run `pnpm build` again after you change a package. |
| `pnpm test` | Unit and font tests. |
| `pnpm test:e2e` | Rendering in Chromium, Firefox and WebKit, and the studio. Run `pnpm build` first. |
| `pnpm fonts` | All eight prebuilt fonts, OpenType and WOFF2, into `dist/fonts`, as the release builds them. It takes about 2 minutes. |
| `node packages/cli/bin.mjs dev` | The studio as users get it, built from your checkout. |
| `pnpm dict:update` | Downloads JMdict, JMnedict, JmdictFurigana, KANJIDIC2 and the JLPT lists and recompiles the dictionary, the place names, the okurigana pairs and the JLPT levels. |

## How it fits together

[docs/design.md](docs/design.md) explains the design. Four rules matter for most changes:

- **`@furifont/core` reads no fonts, and `@furifont/compiler` decides no readings.** The plan (`PlanSchema`) is the only thing passed between them. A change to which words get ruby, or how, belongs in core. A change to how glyphs are drawn or compiled belongs in the compiler.
- **Core, the compiler, the dictionary and helper-web run in browsers too.** They take and return bytes and use no Node APIs, and ESLint rejects `node:` imports in them. Files and the base-font cache belong to the CLI. Node's Brotli and hb-subset loader live in `@furifont/compiler/node`, which the CLI passes in.
- **Browsers shape one script at a time.** A rule can only see a run of kanji, never the kana around it. HarfBuzz on a whole string matches rules that no browser does. So check any change to rendering with `pnpm test:e2e`, not with HarfBuzz alone.
- **Never edit `packages/dictionary/data/dictionary.json`, `places.json` or `okurigana.json` by hand.** Regenerate it with `pnpm dict:update`. To fix a wrong default reading, add the word to `packages/dictionary/src/overrides.ts`, with a comment that says why.

The app uses Nuxt and UnoCSS. Colors come only from the `--ff-*` tokens in `packages/app/uno.config.ts`. Corners are square, and SFCs have no `<style>` blocks.

The interface is in English, Japanese, Simplified Chinese and Traditional Chinese. The fonts themselves target Japanese only. Messages live in `packages/app/app/locales/`. `en.ts` is the source, and the other locales are typed against it, so a missing or extra key fails `pnpm typecheck`. Japanese sample text keeps `lang="ja"` in every interface language.

## Pull requests

- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org).
- The pre-commit hook runs the full check: `pnpm lint && pnpm build && pnpm typecheck && pnpm knip && pnpm test`. Run `pnpm test:e2e` as well when you change rendering, the compiler or the studio.
- Test behaviour: what a text shapes to, or what a page shows. Don't test which function was called.

## Releases

Maintainers release with `pnpm release`. It builds the packages, asks for the new version, and commits, tags and pushes the bump. Git keeps no fonts.

The tag then makes CI:

- publish the npm packages;
- build all eight fonts, stamped with the version and the tag's commit time, and attach them to the GitHub Release;
- redeploy the site through the `VERCEL_DEPLOY_HOOK` secret.

Vercel deploys the site from `main` on every push. Its build downloads the variable WOFF2s and their `.ivs.json` from the release of the version in `package.json` (`pnpm fonts:fetch`), so its build of the release commit fails until CI has attached them and redeploys. `pnpm dev` downloads them the same way.
