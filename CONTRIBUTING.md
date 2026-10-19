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
| `pnpm dict:update` | Downloads JMdict, JMnedict, JmdictFurigana, KANJIDIC2, the JLPT lists and Tatoeba's example sentences into `packages/dictionary/raw/`: the words, the place names, the okurigana pairs, the JLPT levels and the words' uses in the sentences. `pnpm build` then fuses them. |

## How it fits together

[docs/design.md](docs/design.md) explains the design. Four rules matter for most changes:

- **`@furifont/core` reads no fonts, and `@furifont/compiler` decides no readings.** The plan (`PlanSchema`) is the only thing passed between them. A change to which words get furigana, or how, belongs in core. A change to how glyphs are drawn or compiled belongs in the compiler.
- **Core, the compiler, the dictionary and helper-web run in browsers too.** They take and return bytes and use no Node APIs, and ESLint rejects `node:` imports in them. Files and the base-font cache belong to the CLI. Node's Brotli and hb-subset loader live in `@furifont/compiler/node`, which the CLI passes in.
- **Browsers shape one script at a time.** A rule can only see a run of kanji, never the kana around it. HarfBuzz on a whole string matches rules that no browser does. So check any change to rendering with `pnpm test:e2e`, not with HarfBuzz alone.
- **Never edit `packages/dictionary/raw/` by hand.** Regenerate it with `pnpm dict:update`. To fix a wrong default reading or add a missing word, use `pnpm dict:override`: it writes the word, with a comment that says why, to the `<dataset>.overrides.jsonc` beside the dataset in `raw/` (`jmdict`, `places`, `jlpt`, `tatoeba`, `okurigana` for a pair like `上[うえ]に`, or a manual list). Those files are curated by hand and kept. The dictionary's build fuses `raw/` and the overrides into `data/dictionary.json` and `data/okurigana.json`, which it publishes; `data/` is not committed.
- **Manual word lists** live in `packages/dictionary/raw/`, one file per source, named in core's `MANUAL_SOURCES`. The mahjong yaku are kept by hand. The longer lists (`jr-stations`, `yojijukugo`, `japan-post`) are compiled from their sources by `pnpm -F @furifont/dictionary run update:manual`; do not edit them by hand. A build takes words from every source unless its `sources` option names a subset.

The app uses Nuxt and UnoCSS. Colors come only from the `--ff-*` tokens in `packages/app/uno.config.ts`. Corners are square, and SFCs have no `<style>` blocks.

The interface is in English, Japanese, Simplified Chinese and Traditional Chinese. The fonts themselves target Japanese only. Messages live in `packages/app/app/locales/`. `en.ts` is the source, and the other locales are typed against it, so a missing or extra key fails `pnpm typecheck`. Japanese sample text keeps `lang="ja"` in every interface language.

## Reports

Readers report wrong readings on the `/report` page. The page posts to a Nitro endpoint of the site, `packages/app/server/api/report.post.ts`. It stores each report in Upstash Redis, as JSON, under `report:<ISO time>:<id>`.

Under `pnpm dev`, the page posts to the dev server instead. With no database set up, the dev server prints each report in the terminal and stores nothing. To test with a database of your own:

1. Create a free Redis database on [Upstash](https://console.upstash.com). Do not use the site's database.
2. Put its REST URL and token in `packages/app/.env`. Git ignores this file.

   ```sh
   UPSTASH_REDIS_REST_URL=https://<your-database>.upstash.io
   UPSTASH_REDIS_REST_TOKEN=<your-token>
   ```

   Vercel's Upstash integration calls them `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Either pair works.
3. Restart `pnpm dev`. The reports now go through the same code as on the site, with the same limit of 10 reports an hour from one address.

## Pull requests

- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org).
- The pre-commit hook runs the full check: `pnpm lint && pnpm build && pnpm typecheck && pnpm knip && pnpm test`. Run `pnpm test:e2e` as well when you change rendering, the compiler or the studio.
- Test behaviour: what a text shapes to, or what a page shows. Don't test which function was called.

## Releases

Maintainers release with `pnpm release`. It builds the packages, asks for the new version, and commits, tags and pushes the bump. Git keeps no fonts.

The tag then makes CI:

- publish the npm packages;
- build all eight fonts, stamped with the version and the tag's commit time, and attach them to the GitHub Release;
- push an empty `chore: deploy v<version>` commit to `main`, which deploys the site.

Vercel deploys the site from `main` on every push. Its build downloads the variable WOFF2s and their `.ivs.json` from the release of the version in `package.json` (`pnpm fonts:fetch`). They are not attached yet when the release commit lands, so Vercel skips that commit (`ignoreCommand`) and builds CI's deploy commit instead. `pnpm dev` downloads them the same way.
