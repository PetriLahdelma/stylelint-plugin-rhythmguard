# Rhythmguard Product Direction, September 2026

Date: 2026-09-05. Author: full-repo review after a two-month pause (last commit 2026-07-01).

This document records what the codebase is today, what the market data says, what Rhythmguard should and should not be, and the two tracks of work agreed on 2026-09-05: product hygiene and distribution. It replaces the "Follow-Up Roadmap" in `AUDIT_2_VALIDATION.md` as the planning source of truth.

## 1. Where the codebase stands

Local verification on this date, Node 22.22.3:

| Check | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm test` on Stylelint 16.26.1 | 113/113 pass |
| `npm test` on Stylelint 17.15.0 | 113/113 pass |
| `npm run test:coverage` | 82.9% statements, 72.6% branches |
| `npm run test:pack-smoke` | pass |
| `npm run scales:validate` | pass |

Shape of the package:

- 4 Stylelint rules, 2 ESLint rules, 3 CLI commands, 8 shareable configs, 17 scale presets, an audit API, JSON/Markdown/HTML reporters, baselines, token-source parsing for four formats, hand-written TypeScript declarations.
- About 6.6k lines of source (13.2k counting the `.mjs` wrappers). `src/cli/audit.js` alone is 2,309 lines and holds argument parsing, file walking, git integration, three renderers, baseline logic and the public API in one file.
- README is 833 lines with 25 top-level sections. There are no per-rule documentation pages; each rule's `meta.url` points at a README anchor.
- Two optional configs (`logical`, `tailwind`) pull `stylelint-plugin-logical-css` and `stylelint-config-tailwindcss` in as hard runtime dependencies, so every installer downloads them.
- `src/index.js` exports seven configs but `package.json` exports eight; `react-tailwind` is missing from the programmatic `configs` object.
- CI matrix tests Stylelint 16.0.0 and 16.x only. `peerDependencies` already claims `^17.0.0`, and Stylelint 17 requires Node 20.19 while `engines` still says 18.18.
- `ci.yml` runs on the self-hosted farm. `release.yml` still targets `ubuntu-latest`, so under the current GitHub Actions quota state a tagged release would hang before publish.
- Three Renovate PRs (#29, #30, #32) have been open since July. Two duplicate Dependency Dashboard issues are open.
- The repo carries marketing payload: campaign GIF/WebM, six slide PNGs, Dev.to drafts, outreach templates, CFP text. None of it ships in the npm tarball, but it is a third of the tree a contributor sees.
- The browser playground reimplements scale logic in inline JavaScript rather than bundling the rules, so it can drift from the plugin.

Quality of what exists is high. Test coverage is real, option validation is strict, the audit contract is versioned, autofix is deterministic and documented. The problem is not quality. The problem is breadth relative to adoption.

## 2. What the adoption data says

npm downloads, last 30 days as of 2026-09-05:

| Package | Downloads | GitHub stars |
| --- | ---: | ---: |
| stylelint (core) | 43,957,866 | |
| stylelint-scss | 20,889,224 | 881 |
| stylelint-order | 9,997,360 | |
| eslint-plugin-tailwindcss | 6,703,172 | 2,074 |
| eslint-plugin-better-tailwindcss | 3,532,459 | 828 |
| stylelint-declaration-strict-value | 2,260,291 | 144 |
| stylelint-value-no-unknown-custom-properties | 1,082,953 | 76 |
| stylelint-plugin-logical-css | 381,558 | 65 |
| stylelint-plugin-defensive-css | 40,112 | 173 |
| stylelint-8-point-grid | 40,335 | |
| stylelint-scales | 8,997 | 26 |
| @deslint/eslint-plugin | 1,564 | |
| stylelint-plugin-rhythmguard | 1,773 | 5 |

Rhythmguard's own signals:

- Monthly downloads have been flat between 1,300 and 2,400 since May 2026. Repo traffic in the last 14 days is 2 views from 2 unique visitors and 62 clones from 21 unique sources. That pattern matches CI and bot traffic, not developers evaluating a tool. Treat the download number as mostly self-generated.
- 5 stars, 0 forks, no external issues, no external PRs across seven months.
- The awesome-stylelint listing was merged on 2026-05-03 (stylelint/awesome-stylelint#114). It did not change the download curve. Two Dev.to articles and a browser playground also did not.
- The one documented production adoption is the maintainer's own Digitaltableteur (216 CSS files, warning-level baseline ratchet, autofix explicitly disabled because scale snapping changes visuals).

Three data points matter most:

1. `stylelint-scales`, a scale-enforcement pack maintained inside the Stylelint org, gets about 9k downloads a month. Spacing-scale enforcement in CSS is a structurally small lane regardless of who builds it. Rhythmguard cannot out-market its way out of that.
2. `stylelint-8-point-grid` gets 40k a month. It is one rule, zero dependencies, no tokens, no autofix, no CLI. It checks whether values are multiples of 8. It out-distributes Rhythmguard 22 to 1 on the simplest possible version of Rhythmguard's own core feature. The lesson is about shape, not capability: small, zero-config, one obvious rule is what teams and shared configs actually adopt.
3. The Tailwind class-string lane on ESLint is three orders of magnitude larger. `eslint-plugin-better-tailwindcss` went from zero to 3.5M monthly downloads in roughly eighteen months. It did that by shipping Tailwind v4 support during the seventeen months in which the incumbent `eslint-plugin-tailwindcss` had v4 only in alpha (Tailwind 4.0.0 shipped 2025-01-21, the incumbent's first stable 4.x shipped 2026-06-19). That window is now closed. Rhythmguard still owns the one feature those plugins are criticised for lacking, but the gap that made rapid growth possible no longer exists.

Where the big numbers come from, by mechanism:

| Package | Downloads | Repos depending on it | Mechanism |
| --- | ---: | ---: | --- |
| stylelint-config-tailwindcss | 625k | 1,396 | A 40-line config that stops Stylelint rejecting Tailwind at-rules. Universal, mechanical, zero opinion. |
| stylelint-plugin-logical-css | 383k | 127 | Transitive inclusion through shared configs (Taiga UI's `@taiga-ui/stylelint-config`) and large monorepos (Gutenberg, wp-calypso, Penpot, Liveblocks, Mastodon). 65 stars. |
| stylelint-plugin-defensive-css | 42k | 98 | Direct adoption by teams that want the opinion. Well-known author, companion site. |
| stylelint-plugin-rhythmguard | 1.8k | 7 | Six of the seven are the maintainer's own repositories. |

Rhythmguard's problem is opinionated. Nobody's build breaks without it, so it never gets the "make the error go away" adoption that carries the Tailwind config, and no framework default will include a spacing opinion. The realistic ceiling for direct adoption of an opinionated governance plugin is the defensive-css and 8-point-grid band, 20k to 50k a month. Reaching the logical-css band requires the transitive mechanism: being embedded in shared configs that other people install.

The ESLint-lane opportunity has evidence. francoismassart/eslint-plugin-tailwindcss#375 is an open complaint that `no-unnecessary-arbitrary-value` blindly rewrites intentional arbitrary values and has no design-system awareness. Users asked for tolerance, opt-out, and token awareness. Rhythmguard's scale-aware nearest-value check with a token map is exactly that answer, but it is published under a `stylelint-plugin-*` name with an `/eslint` subpath, where no ESLint user will find it.

A new competitor has arrived in the adjacent narrative space. Deslint (MIT core, single maintainer, first published spring 2026) ships an ESLint plugin, a CLI, an MCP server for coding agents, a GitHub Action with inline PR comments, and a 0 to 100 "Design Health Score". It positions itself as "the verification layer for AI-generated code" with 62 rules spanning design tokens, accessibility, backend security and AI anti-patterns. Its ESLint plugin downloads are currently on par with Rhythmguard. Its bet is breadth plus the AI-agent story. Rhythmguard should not follow it into breadth, but should note that the "health score plus CI gate plus agent-readable output" surface is now table stakes and Rhythmguard's audit already has most of it.

## 3. What makes Stylelint plugins popular

Derived from the table above and from reading the top repositories' READMEs and docs:

1. Being on the default path. The million-plus packages are either shareable configs that frameworks and scaffolders extend, or preprocessor and ordering support that nearly every project needs. Discovery happens through dependency graphs, not awesome-lists.
2. Solving a universal, mechanical, low-controversy problem. Ordering, formatting, SCSS syntax, browser support. Design governance is opinionated by nature and therefore niche.
3. One-line adoption: a `recommended` config and nothing else to decide.
4. Per-rule documentation pages with passing and failing examples, and a short root README that links to them. stylelint-order, stylelint-scss and stylelint-scales all do this. The Stylelint plugin guide expects `meta.url` to point at a rule page.
5. For anything that targets JSX/TSX class strings, being an ESLint plugin with an `eslint-plugin-*` name and a flat-config `recommended` export.
6. Fast framework tracking: Tailwind v4 support on day one, detection of `cn`, `clsx`, `cva`, `twMerge`, monorepo config resolution, editor fix-on-save instructions.
7. Minimal dependency footprint and compatibility expressed through `peerDependencies`.
8. Trust signals: org ownership or a long maintenance record. Rhythmguard cannot buy these, only earn them by keeping the surface small and stable.

Rhythmguard did 3 and part of 6. It missed 1, 4, 5 and 7, and it inverted 2 by adding motion, radius, typography and size governance before the core spacing story had a single external adopter.

## 4. What Rhythmguard is

Rhythmguard is deterministic scale and token drift governance for spacing values in CSS declarations and Tailwind class strings, delivered as lint rules for enforcement and an audit CLI for measurement and ratcheting.

The defensible core, in priority order:

1. Scale-aware checking. It reports the two nearest on-scale values instead of banning arbitrary values wholesale. No competitor in either ecosystem does this.
2. Token-aware autofix from a real token map built from CSS custom properties, Tailwind v4 `@theme`, Style Dictionary or DTCG files. Deterministic, never guessed.
3. One scale, both surfaces. The same configuration governs `padding: 13px` and `p-[13px]`.
4. Legacy-safe rollout. Baselines, `--fail-on-new-drift`, changed-files-only scopes and a cleanliness score make it adoptable in a 200-file codebase without a rewrite. Digitaltableteur proves the pattern: warning-level, autofix off, ratchet in pre-commit and PR gates.

## 5. What Rhythmguard is not

- Not a general CSS quality suite. Defensive CSS, logical CSS, ordering and a11y are owned by other plugins. Rhythmguard should compose with them in documentation, not depend on them at runtime.
- Not an "everything AI writes" verifier. Deslint is making that bet with 62 rules across security, a11y and backend. Rhythmguard stays on spacing and tokens and wins on depth.
- Not a motion linter by default. `MOTION_DEFAULTS_EVIDENCE.md` already concluded that reduced-motion overrides and generated assets make motion too noisy for `recommended`. Motion stays opt-in and frozen; no new motion features until the spacing lane has external adopters.
- Not a config buffet. Eight configs and seventeen presets is a decision burden for a package with five stars. The next major consolidates to `recommended`, `strict` and `tailwind`, with `migration` documented as an options pattern rather than a separate entry point.
- Not a marketing repository. Campaign media, outreach drafts and article sources move to a separate repo or a `site/` branch. The package repo should look like a linter.
- Not a playground that reimplements the rules. Either the playground bundles the real rule code via a build step, or it is retired in favour of a "copy this config, run `npx rhythmguard audit`" quick start.

## 6. Plan: two tracks

The decision, taken 2026-09-05, is to run both tracks. Both tracks live in this repository. Track B is not a new plugin; it is the existing Stylelint rule made embeddable and then placed into other people's shared configs. The separate ESLint package (Track A, v3.0 item 4) completes the niche product and is published from the same workspace. Track A makes Rhythmguard a well-built niche tool with a ceiling near 50k a month. Track B is the distribution play that can reach the logical-css band by getting Rhythmguard embedded in shared configs that other people install. Track A is a prerequisite for Track B, not a parallel stream: nobody embeds a plugin with hard runtime dependencies, an 833-line README and eight configs into a shared config they maintain for others.

The two tracks have different kinds of difficulty. Track A is mechanical engineering work and can be done in a handful of focused sessions. Track B's code items are moderate, but its critical path is not code. It is other maintainers deciding to add a spacing opinion to a config their users install, and that is won one repository at a time with evidence, not features.

### Track A: product hygiene

#### v2.1 (non-breaking, ship first)

1. Per-rule docs under `docs/rules/<rule>.md` with passing and failing examples, options tables and autofix notes. Point every `meta.url` at them. Cut the README to about 150 lines: what, install, `recommended`, audit one-liner, links.
2. Add Stylelint 17 to the CI matrix. Tests already pass; make it a gate.
3. Move `release.yml` onto the self-hosted runner labels used by `ci.yml`. Until then no release can complete.
4. Add `rhythmguard audit --format github` emitting workflow-command annotations. Stylelint 17 removed its own GitHub formatter, so this is cheap and immediately useful in PR gates.
5. Fix the `configs` export mismatch (`react-tailwind` missing from `src/index.js`).
6. Add a `tsc --noEmit` check over `types/*.d.ts` and the examples so the declarations cannot silently drift. There is currently no typecheck step at all.
7. Merge the three Renovate PRs after the local gate, close the duplicate Dependency Dashboard issue, add a bug-report issue template alongside the scale-request one.
8. Split `src/cli/audit.js` into `audit/{args,config,scan,contract,baseline,render-*}.js`. No behaviour change; the contract tests already cover the seams.

#### v3.0 (breaking)

1. Drop Node 18. Set `engines` to `>=20.19` to match Stylelint 17.
2. Turn `stylelint-plugin-logical-css` and `stylelint-config-tailwindcss` into optional peer dependencies (`peerDependenciesMeta`). The `logical` config either goes or becomes a documented composition snippet. Zero hard runtime dependencies beyond `known-css-properties` is a Track B requirement.
3. Consolidate configs to `recommended`, `strict`, `tailwind`. Fold `react-tailwind` overrides into `tailwind` docs. Keep `motion` as opt-in and document it under "experimental".
4. Publish `eslint-plugin-rhythmguard` as its own npm package with flat-config `configs.recommended` and ecosystem-conventional rule names (`rhythmguard/no-offscale-arbitrary-value`, `rhythmguard/no-offscale-arbitrary-motion`). Keep `stylelint-plugin-rhythmguard/eslint` as a deprecated re-export for one major. This is a Track A item because it completes the product; it is not on the Track B critical path, see B5.

   Repository layout for this: one repository, npm workspaces, three packages. `packages/core` holds the scale and token engine extracted from today's `src/utils/` with no Stylelint or ESLint imports. `packages/stylelint-plugin` and `packages/eslint-plugin` are thin adapters over it. Do not start a second repository: the two plugins must agree on scale resolution, token parsing and nearest-value semantics on every release, and a shared workspace is the only cheap way to guarantee that. One CI matrix, one changelog, two published packages. The audit CLI stays in the Stylelint package until it has a reason to move.
5. Rebuild or retire the playground per section 5.
6. Move marketing assets out of the repo.

### Track B: distribution

The unit of adoption is a shared Stylelint config maintained by a design-system or platform team. Every such config that adds `rhythmguard/use-scale` at warning level delivers Rhythmguard to all of that config's installers. Taiga UI's config alone is 12k installs a month; Primer, GitLab, JetBrains, WordPress, Bootstrap and Wikimedia publish configs in the same class.

#### B1. Zero-config scale inference

Add `scale: "auto"` to `use-scale`, and make it the default in `recommended`. Resolution order: Tailwind v4 `@theme` spacing variables in the linted stylesheet or a configured entry CSS; CSS custom properties matching the token pattern; a DTCG or Style Dictionary file if configured; `theme.spacing` from a Tailwind v3 config if present; fall back to `rhythmic-4` only when nothing is found, and say so in the first message. The audit report states which source produced the scale. This is what lets a shared-config author enable the rule without knowing each consumer's scale. Most of the parsing already exists in `token-sources.js`; the work is wiring it into rule resolution and caching per root.

Semver note, decided 2026-09-05: `scale: "auto"` ships opt-in in 2.2 together with the `embed` entry point (B3), which uses it. `recommended` keeps `rhythmic-4` until 3.0, because CONTRIBUTING classes a default-scale change as breaking. First matching source wins; sources are not merged, so the provenance reported by the audit is a single file or the stylesheet.

#### B2. Quiet benchmark

Status 2026-09-05: harness shipped (`npm run bench:quiet`, results in [`QUIET_BENCHMARK.md`](./QUIET_BENCHMARK.md)). First run found that every repository fell back to `rhythmic-4`; fixing that (calc-wrapped tokens, Tailwind v4 base, prefixed names) and removing percentage findings from `prefer-token` were the first two defaults the benchmark bought. Remaining heuristic false positives were dominated by 1px hairlines. Decision 2026-09-05: hairlines (non-zero lengths of one CSS pixel or less) are exempt by default in all three scale rules via `allowHairlines`, with `allowHairlines: false` as the opt-out; shipped in 2.2 as a false-positive fix and explained in the `use-scale` rule doc.


Define "quiet" as findings a maintainer of the scanned repo would accept as real drift. Run `recommended` against twenty public design systems and shared-config consumers (start with Primer CSS, Gutenberg, Penpot, Liveblocks, Taiga UI, Koobiq, mittwald Flow, Bootstrap, Orbit, shadcn/ui) using the existing `scripts/bench` harness extended with a review-classification step. Publish results in `docs/QUIET_BENCHMARK.md` with a per-repo false-positive rate. Target under 5% before any outreach. The Digitaltableteur adoption already showed the required profile: warning level, autofix off, baseline ratchet. Anything the benchmark flags as systematic noise (reduced-motion overrides, generated assets, third-party CSS, `0.01ms`) becomes a default ignore or a documented allowance, not a per-consumer setting.

#### B3. Embed kit for shared-config authors

Status 2026-09-05: shipped. `configs/embed` and [`FOR_CONFIG_AUTHORS.md`](./FOR_CONFIG_AUTHORS.md). The guide also covers the case the first external adopter (doctor-school/ds-platform) solved on their own: tokens that live in a package or a Style Dictionary build, fed through `scaleSources`.

A short `docs/FOR_CONFIG_AUTHORS.md`: the exact `rules` block to add, why warning level, how consumers opt out per file, how consumers override the scale, the dependency footprint (zero hard deps, Stylelint 16 and 17), and the support commitment. Ship a `stylelint-plugin-rhythmguard/embed` config entry point that is `recommended` with `scale: "auto"` and warning severity and nothing else, so config authors have a stable one-liner that will not change shape between minors.

#### B4. Target list and outreach method

Two lists, worked in order, each entry pitched with a Markdown audit of the target's own repository generated by `rhythmguard audit --format markdown` and a one-block config proposal.

Shared configs (each installs into many repos):

- `@taiga-ui/stylelint-config` (already includes logical-css, rem-over-px, use-baseline; closest cultural fit)
- `@primer/stylelint-config` (GitHub Primer; strong spacing scale, `--base-size-*` tokens)
- `@gitlab/stylelint-config`
- `@jetbrains/stylelint-config`
- `stylelint-config-twbs-bootstrap`
- `@wordpress/stylelint-config` and `@10up/stylelint-config`
- `stylelint-config-wikimedia`
- `@lucca/stylelint-config-prisme`

Design-system monorepos that already carry opinionated plugins (each is a large single adopter and a public reference):

- WordPress/gutenberg (`tools/stylelint`), Automattic/wp-calypso
- penpot/penpot, liveblocks/liveblocks, mastodon/share
- koobiq/react-components, mittwald/flow, kiwicom/orbit, corex-ui/corex-ui, LouisMazel/maz-ui

Method: open an issue, not a PR, attaching the audit and offering to maintain the config block. Accept "warning-level, one rule, off by default in strict mode" as a win. Record every response in `docs/outreach/embed-log.md` because the pattern of objections is the next backlog.

#### B5. Upstream the scale-aware arbitrary-value rule

Propose `no-off-scale-arbitrary-values` to `eslint-plugin-better-tailwindcss`, built on the same `src/core/` engine, with the token-map fix and nearest-value message. Link the rule docs to Rhythmguard for the CSS side and the audit report. This reaches 3.7M installs a month with the idea and none with the package. It is the highest-leverage move for the problem and the lowest for the download count, and it does not conflict with A.v3.4: the standalone ESLint plugin serves teams that want CSS and class strings governed by one config, the upstream rule serves everyone else.

#### B6. Watch item: the next incumbent gap

Tailwind v5, or a shift of CSS linting to Biome or Oxlint, would open the kind of window that produced better-tailwindcss. Keep `src/core/` free of Stylelint and ESLint imports so a Biome or Oxlint adapter is a wrapper, not a rewrite.

### Sequencing

1. Track A v2.1 in full. Nothing in Track B is credible while the release pipeline cannot publish and the README is 833 lines.
2. B1 and B2 together, because the benchmark is how B1's inference is tuned.
3. Track A v3.0 items 1 to 3 (Node floor, optional peers, config consolidation), then B3. The embed entry point should ship in the same major that removes the hard dependencies.
4. B4 outreach begins only after B2 shows under 5% false positives on the benchmark set.
5. B5 upstream proposal in parallel with B4.
6. Track A v3.0 items 4 to 6 (standalone ESLint plugin, playground, asset move) as capacity allows; none of them gate distribution.

### Delivery standard (added 2026-09-05)

A developer in a repository we have never seen runs one command with no configuration and gets a correct, quiet, explained result in under a minute, and every release proves that against real public codebases. `npx rhythmguard` (zero-config quickstart) is the first half; the quiet benchmark run on every change is the second. Both shipped 2026-09-05: bare `npx rhythmguard`, and `bench:quiet --check` against pinned commits with committed snapshots, enforced by the Quiet Benchmark workflow on the farm. Outreach waits until the tool earns it.

### Deferred

- MCP server or other agent-native surfaces. The audit JSON contract plus the `AGENTS.md` block in [`FOR_AGENTS.md`](./FOR_AGENTS.md) (shipped 2026-09-05) is enough for coding agents today.
- Oxlint support for the ESLint plugin, until B6 triggers.
- Any new property group, scale preset or reporter format.
- Articles, newsletter submissions and conference proposals about features, until B4 has produced at least two embedded configs to write about. Data pieces from the benchmark are not deferred; see section 9.

## 7. Success metrics

Downloads are a lagging indicator of distribution mechanism and are currently dominated by the maintainer's own CI. Track them, but steer by:

| Metric | Now | Track A target (v3.0 plus 6 months) | Track B target (18 months) |
| --- | ---: | ---: | ---: |
| Shared configs embedding Rhythmguard | 0 | 1 | 6 |
| External repos depending on it (GitHub code search, excluding own org) | 1 | 10 | 60 |
| Issues or PRs from other people | 0 | 5 | 25 |
| Unique repo visitors per fortnight | 2 | 50 | 200 |
| Quiet benchmark false-positive rate | unmeasured | under 5% | under 3% |
| Monthly downloads | 1.8k | 20k | 150k |

If Track A targets are missed, the cause is product and the fix is in this repo. If Track A targets are met and Track B targets are missed, the cause is the lane, and the honest conclusion is that Rhythmguard is a maintained, stable, small tool used by its author's projects and a few teams who sought it out. That is a fine outcome. It should be reached on evidence, not drifted into.

## 8. Sources consulted

- npm download API and registry metadata for every package in the tables, including publish timelines for tailwindcss 4.0.0, eslint-plugin-tailwindcss 4.x and eslint-plugin-better-tailwindcss, 2026-09-05.
- GitHub code search for `package.json` files depending on stylelint-plugin-logical-css, stylelint-config-tailwindcss, stylelint-plugin-defensive-css and stylelint-plugin-rhythmguard, 2026-09-05.
- npm search for `stylelint-config` keyword packages and the dependency lists of `@taiga-ui/stylelint-config` and `@wordpress/stylelint-config`.
- GitHub API for stars, forks and repo traffic, 2026-09-05.
- stylelint/awesome-stylelint README and CONTRIBUTING, and the merged PR #114.
- Stylelint 17 migration guide and the plugin developer guide.
- READMEs of stylelint-order, stylelint-scales, stylelint-declaration-strict-value, stylelint-plugin-defensive-css, eslint-plugin-tailwindcss, eslint-plugin-better-tailwindcss.
- francoismassart/eslint-plugin-tailwindcss issue #375.
- deslint.com home and docs, and the `@deslint/*` packages on npm.
- LLM-wiki entity page for Rhythmguard and the Digitaltableteur adoption capture of 2026-07-18.

## 9. Being talked about (added 2026-09-06)

Sections 6 and 7 are about being installed. This section is about being discussed, which is a different mechanism with a different unit of work. Downloads follow shared configs; conversation follows artifacts people link to. The tools in this category that get talked about (stylelint-plugin-defensive-css, better-tailwindcss, Knip, Biome) each own one artifact that is quoted without the tool being installed: a named idea, a benchmark table, a migration story, a number. Rhythmguard has three candidates already built and none of them published as a thing in its own right: the quiet benchmark data, the phrase "nobody chose 13px", and the drift-by-property table.

The deferral in section 6 ("articles until B4 has produced two embedded configs") stays for feature marketing. It is lifted for data. Twenty audited design systems with committed, reproducible snapshots is a dataset, and datasets travel on their own.

### 9.1 The artifact: State of Spacing (issue #70)

Status 2026-09-06: generator shipped (`npm run bench:state-of-spacing`, output in [`STATE_OF_SPACING.md`](./STATE_OF_SPACING.md) and `docs/state-of-spacing/<edition>.{md,json}`), first edition cut at 20 repositories and unpublished. Publication waits for the 50-repository manifest and the audit issues.

A standing report generated from the benchmark: every repository, its inferred scale and where it came from, off-scale count, cleanliness, top three values, top three properties, and the trend since the last edition. Published as `docs/STATE_OF_SPACING.md` from the same script that writes `QUIET_BENCHMARK.md`, cut as a dated edition each quarter, and posted once as an article with the table embedded. The framing is consistency, not shame: each row links to the audit the maintainer can run themselves, and the edition is published only after every repository in it has an issue with its audit attached (B4, which this makes concrete). Widen from 20 to 50 repositories before the first edition so no single team feels singled out. Rankings are what get quoted; the property table is what gets argued about, and argument is the goal.

### 9.2 The badge (issue #68)

A `spacing drift` badge for READMEs, the way coverage badges spread coverage tools. `rhythmguard audit --format badge` writes a shields.io endpoint JSON (`{ schemaVersion: 1, label: "spacing drift", message: "3%", color }`), a GitHub Action publishes it to the repository's Pages or a gist, and the README embeds it. Every repository that shows the badge shows the name. The design-system repositories in the benchmark are the first targets: offer the badge in the same issue as the audit.

### 9.3 The action

`PetriLahdelma/rhythmguard-action` on the GitHub Marketplace: runs the audit with a baseline, posts one sticky PR comment with the delta and the property table, emits annotations, writes the badge. The Marketplace is a discovery surface with search traffic of its own, and a PR comment is seen by everyone on the PR, not only the person who configured it. The action is a thin wrapper over the CLI and lives in this repository as a workspace so it releases with the plugin.

### 9.4 Agents as the distribution channel that talks back (issue #69)

Coding agents generate most new off-scale values and read `AGENTS.md`. Publish the [`FOR_AGENTS.md`](./FOR_AGENTS.md) block as installable skill packs where agents look for them: a Claude Code skill, a Cursor rules file, a Copilot instructions snippet, each one file and each linking back. An agent that runs `npx rhythmguard` on a user's repository puts the name into a conversation the maintainer never had to start. The MCP server stays deferred; the skill files are an afternoon.

### 9.5 Fix pull requests, not only issues

B4 opens issues with audits. Where a benchmark repository shows one value explaining a third of its drift (Mastodon's `10px`, 165 times), offer a pull request fixing that one value, with before and after screenshots, after the issue has been acknowledged. A merged fix in a well-known repository is a public reference that an issue is not, and the conversation in the review is where maintainers say what the tool got wrong. Never open the PR unasked.

### 9.6 The phrase

"Nobody chose 13px" is the only line about Rhythmguard that people repeat. Give it a home: a one-page site at a memorable domain with the quickstart command, the Mastodon histogram, and nothing else, plus stickers for the two conferences below. The GitHub about text and the npm description already carry it; the README slogan, the Dev.to draft and the talk title should be the same words. One phrase, everywhere, until it is the tool's name in conversation.

### 9.7 Where to say it

Places that carry data pieces without an existing audience, in order of cost:

1. Newsletters that accept submissions: CSS Weekly, Frontend Focus, Smashing Newsletter, JavaScript Weekly. Submit the State of Spacing edition, not the plugin.
2. Podcasts that take pitches with a number in them: Syntax, ShopTalk Show, JS Party, The CSS Podcast. The pitch is "we audited fifty design systems and here is what drifted", with the maintainer as the guest who did the work.
3. Conference CFPs where the audience maintains design systems: CSS Day, Smashing Conf, Into Design Systems, Beyond Tellerrand, Nordic.js. The talk is the report plus the Mastodon before and after; the tool appears in one slide.
4. The playground (issue #57), rebuilt on the real rules with a shareable result URL that renders an image card, so a pasted-CSS result can be posted rather than described.

### 9.8 What not to do

No disguised comments on other people's articles, no unsolicited pull requests, no ranking that names a team without giving it the audit first, and no article about a feature. Every public word is either a number from a reproducible run or a sentence a maintainer of a benchmark repository said to us. The reason is section 7's last paragraph: if the tool is not worth talking about, the honest outcome is a stable small tool, and it should be reached on evidence.

### 9.9 Metrics for this section

| Metric | Now | 6 months |
| --- | ---: | ---: |
| Repositories showing the badge | 0 | 10 |
| Public mentions per month (GitHub, Bluesky, Mastodon, X, newsletters), excluding own | 0 | 20 |
| Benchmark repositories with an acknowledged audit issue | 0 | 15 |
| Merged fix PRs in benchmark repositories | 0 | 3 |
| Newsletter placements, podcast or talk slots | 0 | 3 |
| Unique repo visitors per fortnight | 2 | 300 |

### 9.10 Sequencing

1. Badge format and skill packs first; both are small and neither needs anyone's permission.
2. Widen the benchmark to 50 repositories (issue #56 is the entry point for contributors), then generate the first State of Spacing edition.
3. Open the B4 audit issues with the badge offer; wait for acknowledgements.
4. Publish the edition, submit it to the newsletters, pitch the podcasts, file the CFPs.
5. Action and playground as capacity allows; they amplify but do not gate.
