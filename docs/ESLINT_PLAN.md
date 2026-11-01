# ESLint plan: make `eslint-plugin-rhythmguard` a first-class product

Written 2026-11-01. Amends the council plan of record ([`COUNCIL_2027-2028.md`](./COUNCIL_2027-2028.md), Amendment 1). Every number below names its source and date; all npm figures come from `api.npmjs.org` and every competitor claim was checked by running the tool on the same input.

## Decision

Rhythmguard builds a credible ESLint plugin for spacing in class strings, aimed at Tailwind v4 apps, and keeps one repository. The plugin reads the same token files as the Stylelint rule, checks the spacing steps Tailwind v4 accepts without brackets, and suggests the nearest step instead of rewriting layout. A measurement step on 2026-11-15 can stop the build before it starts, and a demand test on 2027-03-31 decides whether ESLint stays the lead product.

## What the evidence says

### The audience: ESLint is 15 times larger and growing faster

| Package | Oct 2025 | Oct 2026 | Year on year |
| --- | ---: | ---: | ---: |
| eslint | 295.2M | 595.0M | +102% |
| stylelint | 28.3M | 39.2M | +38% |
| oxlint | 2.5M | 105.3M | 42x |
| @biomejs/biome | 14.9M | 68.8M | +362% |
| tailwindcss | 119.8M | 503.7M | +320% |
| eslint-plugin-tailwindcss + eslint-plugin-better-tailwindcss | 5.4M | 11.8M | +118% |
| stylelint-config-tailwindcss | 0.38M | 0.59M | +56% |
| @eslint/css | 0.61M | 2.10M | +244% |

Source: `api.npmjs.org/downloads/range`, calendar months, fetched 2026-11-01.

- ESLint downloads went from 10.4 times Stylelint's to 15.2 times in one year. Oxlint passed Stylelint during 2026 and now runs at 2.7 times its volume.
- ESLint's two Tailwind plugins draw 20 times the downloads of Stylelint's Tailwind config (11.8M against 0.59M a month).
- GitHub code search, 2026-11-01, `package.json` files that mention `tailwindcss` (about 4.84M): about 66% also mention `eslint`, 1.8% `oxlint`, 1.0% `@biomejs/biome`, and 0.27% `stylelint`. GitHub reports these counts as estimates; read them as orders of magnitude.
- Surveys: State of JS 2025 (Utilities, n=10,812) has ESLint at 89.7%. State of CSS 2025 (Utilities, n=3,925) has Stylelint at 33.1%, and Tailwind at 51.3% of 3,977 framework answers. Both samples are self-selected and differ, so compare within a survey, not across.
- Scaffolds: `create-next-app` 16.4 offers ESLint by default with Tailwind on; `create-vite` 9.3 React installs Oxlint by default since 2026-06-15. No scaffold checked (Next, Vite, Nuxt, SvelteKit, Angular, Astro) installs Stylelint.

### The gap: no tool snaps an off-scale class to the nearest step

Input: `p-[13px] m-[12px] gap-[0.75rem] px-[14px]`, default theme, tested 2026-11-01.

| Tool | What it does with `p-[13px]` |
| --- | --- |
| eslint-plugin-better-tailwindcss 4.10.0 | "can be simplified to `p-3.25`": same value, no scale check |
| eslint-plugin-tailwindcss 4.4.0 | no finding (flags only `m-[12px]` and `gap-[0.75rem]`, which have exact equivalents) |
| @shadcn/lint 0.2.3 | "Use a theme token or scale value"; its docs suggest `p-3.25`. Nearby steps exist for font sizes and radii only |
| Tailwind CLI 4.3.3 `canonicalize` | `p-[0.8125rem]` becomes `p-3.25` |
| Rhythmguard 3.15.0 | "Use `p-3` (12px) or `p-4` (16px)" |

None of the three ESLint plugins reads a DTCG or JSON token file; all three read the Tailwind CSS entry instead.

**Canonicalisation launders drift, and our rule misses the result.** Tailwind v4 accepts any quarter step of `--spacing` as a plain class, so `p-3.25` is a valid 13px padding. better-tailwindcss and @shadcn/lint suggest `p-3.25` for 13px and the Tailwind CLI writes it, after which every "no arbitrary values" rule passes the class. Rhythmguard 3.15.0 passes it too. Probed on 2026-11-01 with `scale: [0,4,8,12,16,24,32]`:

| Class | Value | Rhythmguard 3.15.0 |
| --- | --- | --- |
| `p-[13px]` | 13px | flagged, suggests `p-3` or `p-4` |
| `mt-[1.1rem]` | 17.6px | flagged |
| `p-3.25` | 13px | **no finding** |
| `gap-4.5` | 18px | **no finding** |
| `p-13` | 52px, above the scale | **no finding** |
| `w-[13px]` | width | no finding (out of scope by design) |

Checking v4 steps against the team's scale is the one capability no competitor ships and the one place our current rule is blind. The plan builds on it.

### The reference user already runs the ESLint path

doctor-school/ds-platform at `a9265b2` (2026-10-30), the council's reference user:

- `eslint.config.js:23` imports `stylelint-plugin-rhythmguard/eslint` and sets the Tailwind rule to `"error"` with a scale read from `allowed-tokens.json` (`:45`, `:51`, `:238-241`). That hand-written read is glue the Stylelint rule does not need, because `scaleSources` reads their token files directly.
- `.oxlintrc.json:10` says "scale discipline is owned by rhythmguard (eslint.config.js)". Oxlint runs only `oxlint-tailwindcss` for colours.
- They run Stylelint `use-scale` too, over margin, padding, gap and inset (`stylelint.config.mjs:35-52`).
- Their 3.6.0 pin accounted for 2,259 of the main package's 3,105 downloads in the week to 2026-10-31 (73%, `api.npmjs.org/versions`). Our largest stream of real use comes through a package named after Stylelint and an ESLint entry point.

## What the evidence does not support

- **That Stylelint caused the low adoption.** `eslint-plugin-rhythmguard` already exists and drew 207 downloads in October against the main package's 6,196. Of its 186 downloads in the last week, 183 were the two newest versions, which our own release and smoke runs fetch. GitHub code search finds no external `package.json` that depends on it. The repository had 17 unique visitors in 14 days. Rhythmguard has a reach problem on every platform; ESLint gives it a larger room to be found in, not a cure.
- **That Tailwind code drifts as much as CSS.** The quiet benchmark (57 design-system repos, `benchmarks/quiet/snapshots`) puts 7,899 of 7,976 findings (99.0%) in CSS and SCSS and 77 in templates. The sample is biased: the manifest selects CSS paths and only 5 of 57 repos use Tailwind. The 2026-10-10 agent eval found 0.5 off-scale values per Tailwind run against 1.0 per CSS run (12 and 29 runs). Nobody has measured drift in Tailwind v4 apps. Phase 0 does.
- **That ESLint can replace Stylelint for CSS files.** `@eslint/css` sits at 5.4% of Stylelint's downloads (up from 2.2%) and does not parse SCSS (eslint/css#90, closed as not planned). At the past year's relative growth it would reach the council's 25% trigger around 2028. The trigger stays.
- **That npm counts measure users.** CI installs dominate every figure above, and a single monorepo can outweigh hundreds of small projects. Ratios between comparable packages carry the argument; absolute numbers do not.

## Who it is for

A front-end engineer on a Tailwind v4 app whose spacing scale lives in the Tailwind theme (`--spacing`, `--spacing-*`) or in a token package, who already runs ESLint or Oxlint in CI. The council's design-system engineer stays a user: doctor-school runs both linters, and the ESLint rule reading their token files removes their glue.

## What "credible" means

Each item has a done-when line; together they are the bar for calling the plugin first-class.

1. **One scale, two linters.** `tailwind-class-use-scale` accepts `scaleSources`, `preset` and `scale: "auto"` with the same names and meaning as Stylelint's `use-scale`, through `src/core/token-sources` and `src/core/scale-inference`. Done when doctor-school's config could drop its `allowed-tokens.json` read and get identical findings.
2. **Reads the Tailwind theme.** The rule takes the scale from a Tailwind v4 CSS entry (`--spacing`, `--spacing-*` in `@theme`). Done when the package README stops saying it "does not read your Tailwind theme" (`packages/eslint-plugin-rhythmguard/README.md:80`).
3. **Checks v4 steps.** With a declared scale, `p-3.25`, `gap-4.5` and `p-13` are findings with nearest-step suggestions. Without a declared scale this check stays off, so `p-1.5` on the default theme never fires. Opt-in in 3.x, on by default in 4.0. Done when the probe table above shows findings in every bold row.
4. **Fixes that never move layout.** Autofix only rewrites exact equivalents (`p-[12px]` to `p-3`); snapping 13px to 12px becomes an ESLint suggestion (`hasSuggestions`), in line with `--preserve` (#166). Messages move to `messageIds` with unchanged text.
5. **Runs under Oxlint.** A CI job runs the rule through Oxlint `jsPlugins` on JSX and TSX, pinned to a stated Oxlint version. Docs say plainly that Oxlint JS plugins are alpha and skip Vue and Svelte templates. Absorbs #327.
6. **Installs clean without Stylelint.** `stylelint` becomes an optional peer of the root package (`peerDependenciesMeta`), so an ESLint-only project installs with no peer warning; today it is a required peer (`package.json:161-176`), against `docs/ARCHITECTURE.md:34`.
7. **A ratchet without new code.** Document ESLint's bulk suppressions (`--suppress-all`, since ESLint 9.24.0, 2025-04-04) as the baseline for existing drift. No Rhythmguard baseline format for ESLint.
8. **Its own front door.** The package README opens with a JSX example and the probe table, and links a reproducible comparison script that reruns the competitor test. The repository README gives ESLint equal billing with Stylelint.

## Not in scope

Width, height and size utilities (parity with Stylelint `use-scale` groups). Colours, typography and radii (@shadcn/lint and better-tailwindcss own them). CSS files through `@eslint/css` (#173 keeps its trigger). A separate repository. Biome: its GritQL plugins take no options and its JS plugins are a developer preview without a fix API, so a scale rule cannot be expressed there today.

## Repository: one repo, renamed in 4.0

The ESLint rules use `src/core` (5,270 lines) shared with Stylelint; `src/eslint` is 571 lines. A separate repository would either copy the core or add a fourth package, and would need its own runners, trusted publisher and release workflow, against a GitHub Actions quota that is already spent. Instead:

- **In 4.0**, the `rhythmguard` package becomes the engine (core, audit, CLI); `stylelint-plugin-rhythmguard` and `eslint-plugin-rhythmguard` become plugins that depend on it, so neither linter pulls the other in.
- **In 4.0**, rename the repository to `rhythmguard`. Before the rename, check the npm trusted publishers, the runner labels on both farm hosts, the Pages site and the outreach links; GitHub redirects the old URLs.
- The `stylelint-plugin-rhythmguard/eslint` subpath keeps working through 4.x as a re-export, because doctor-school imports it.

Revisit a separate repository only if someone other than the maintainer takes over the ESLint plugin.

## Phases

| Phase | Dates | Work | Exit |
| --- | --- | --- | --- |
| 0. Measure | 2026-11-02 to 11-15 | Measure 20 public Tailwind v4 apps, fixed in advance in `benchmarks/tailwind-v4/`; prototype v4 step checking on a branch (no release); commit the competitor comparison script | Go/no-go below |
| 1. Build | 2026-11-16 to 12-20 | Items 1 to 8 as 3.x minors under the amended freeze; `--preserve` (#166) lands in the same window | Probe table all bold rows flagged; local gate green; Oxlint job green |
| 2. Distribute | 2026-12 to 2027-01 | One article built on the laundering finding with the reproducible script; Tailwind Discussions show-and-tell; one awesome-list PR. Each post confirmed by the maintainer before it goes out | Posted and logged in `docs/outreach/` |
| 3. 4.0 | with Stylelint 18.0.0, no later than 2027-02-28 | v4 step checking on by default; engine split; repository rename; migration notes for doctor-school's config | Upgrade of doctor-school's config and the benchmark rows with zero unexplained new findings |
| Checkpoint | 2027-03-31 | Demand test below | Decision written into the council plan |

Effort, estimated: about 3 weeks of focused work for phases 0 and 1. To pay for it, the ESLint article replaces the State of Spacing 2026-12 edition (#171) as the single outreach piece of the winter.

### Go/no-go on 2026-11-15

Build phase 1 only if both hold:

- At least 10 of the 20 Tailwind v4 apps have one or more off-scale spacing classes (bracketed or v4 step) against the scale their own theme or tokens declare.
- A hand review of 50 findings rates at least 40 (80%) as drift a designer would fix, not intentional values.

If either fails, Tailwind apps do not drift enough to sell a rule on. Ship items 5 to 8 (Oxlint, clean install, docs), leave the ESLint plugin a companion, and record the result here.

### Demand test on 2027-03-31

Measured with `api.npmjs.org/versions/<pkg>/last-week`, counting only versions published 14 or more days earlier ("aged downloads"), which strips our own release and smoke runs.

| Indicator | 2026-11-01 | Target |
| --- | --- | --- |
| Aged weekly downloads, `eslint-plugin-rhythmguard` | about 3 | 400 |
| External repositories with a committed dependency on the ESLint package or the `/eslint` subpath | 1 (doctor-school) | 4 |
| Issues or PRs about the ESLint plugin from people other than the maintainer | 0 | 2 |

Two of three met: ESLint stays the lead product and gets the 2027 Q2 capacity. Fewer: the problem is distribution, not the host linter; the ESLint plugin returns to companion status, and the council's original course resumes.

## Risks

| Risk | Likelihood | Response |
| --- | --- | --- |
| @shadcn/lint adds nearest-step spacing (it already does nearby steps for font sizes and radii) | High | Our remaining edge: token files, v4 step checking against a team scale, suggestions that never move layout. Read their releases monthly |
| Oxlint JS plugins change in alpha | Medium | Pin the version in CI; ESLint stays the primary target |
| False positives on default-theme steps (`p-1.5`) | Medium | Step checking needs a declared scale; off otherwise |
| Phase 0 sample picks clean or messy repos | Medium | Choose the 20 by stars from public Tailwind v4 apps before running anything, and commit the list first |
| The freeze erodes | Medium | The amendment allows only the eight items above; anything else waits for 4.0 or a named user |
| npm and survey numbers mislead | Known | Decisions rest on ratios, the competitor test and the aged-download metric, not on totals |

## Sources

- npm downloads: `https://api.npmjs.org/downloads/range/2025-10-01:2026-10-31/<pkg>`, `https://api.npmjs.org/versions/<pkg>/last-week`, fetched 2026-11-01.
- Code search counts: GitHub `search/code`, `"tailwindcss" "<linter>" filename:package.json`, 2026-11-01.
- State of JS 2025, other tools: `https://2025.stateofjs.com/en-US/other-tools/`. State of CSS 2025, other tools: `https://2025.stateofcss.com/en-US/other-tools/`.
- Competitor rules: `github.com/schoero/eslint-plugin-better-tailwindcss/tree/main/docs/rules`, `github.com/francoismassart/eslint-plugin-tailwindcss`, `github.com/shadcn-ui/lint` (README and `docs/rules/no-arbitrary-values.md`), tailwindcss PRs #19059 and #19796.
- Oxlint JS plugins: `https://oxc.rs/docs/guide/usage/linter/js-plugins` and the 2026-03-11 alpha post. Biome plugins: `https://biomejs.dev/linter/plugins/`. @eslint/css: `github.com/eslint/css`, issue #90.
- Scaffolds: `vercel/next.js` `packages/create-next-app/index.ts`; `create-vite@9.3.3` `template-react-ts/package.json`; `nuxt/cli` `create-nuxt`; `sveltejs/cli` add-ons; Angular CLI `lint` command; `withastro/astro` `examples/basics`.
- doctor-school/ds-platform at `a9265b2497ef5e3d185ee9c2589f8cedfbe6ce01`.
- Internal: `benchmarks/quiet/snapshots/*.json`, `docs/agent-evals/2026-10-10.json`, `src/eslint/`, `src/core/tailwind-class-analysis.js:18,25`.
