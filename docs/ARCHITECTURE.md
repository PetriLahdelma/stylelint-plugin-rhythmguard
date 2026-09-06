# Architecture

This page explains why the repository is shaped the way it is, so the shape survives contributors who were not there when it was decided. The rules here are executable: `test/contracts/architecture.test.js` fails when a dependency crosses a line, `test/contracts/exports.test.js` fails when CommonJS and ESM diverge, and the quiet benchmark fails when behaviour on real code moves.

## The domain in one paragraph

A **length** is a number with a unit. A **scale** is a sorted list of allowed lengths in px. A **token** is a named length a project defined (`--space-3`, `$spacer`, a Style Dictionary entry). A **finding** is a literal length in a declaration, a transform, a class string or a motion value that is not on the scale, together with the two nearest scale steps and, when the unit allows it, a replacement. Everything else in the repository is a way to obtain a scale, walk a source for lengths, or present findings.

## Layers and the direction they depend in

```
configs   presets                     data: shareable configs, scale presets
   │         │
   ▼         ▼
rules ──► core ◄── eslint             adapters over the domain
   │         ▲
   ▼         │
 audit ──────┘                        project-level analysis, through Stylelint's API
   │
   ▼
  cli                                 thin commands: audit, init, doctor, quickstart
```

| Layer | Directory | May depend on | Must never import |
| --- | --- | --- | --- |
| core | `src/core/` | core, presets | `stylelint`, `eslint` |
| presets | `src/presets/` | presets | frameworks, parsers |
| rules | `src/rules/` | rules, core, presets | |
| eslint | `src/eslint/` | eslint, core | `stylelint` |
| audit | `src/audit/` | audit, core, presets | cli |
| cli | `src/cli/` | cli, audit, core, presets, configs | |
| configs | `src/configs/` | configs | frameworks, parsers |

The direction matters for two concrete reasons. The ESLint plugin must load without Stylelint installed, so nothing under `eslint` or `core` may touch it. And every future adapter (an Oxlint or Biome rule, an MCP server, a Figma plugin) should be a thin wrapper over `core`, not a fork of a rule; that is only possible if `core` owns the domain and the adapters own only the framework contract.

The graph has no cycles. `src/index.js` is the only module that imports from every layer, because it is the package.

## Core: one canonical representation per concept

| Module | Owns | Canonical form |
| --- | --- | --- |
| `core/length.js` | parsing a length token, px conversion, nearest scale steps, hairlines, formatting, the replacement text for a fix | lengths are `{ number, unit }`; scales are sorted px arrays |
| `core/time.js` | the same for durations | ms |
| `core/css-vocabulary.js` | which properties belong to which group, math and translate function names, supported units, default ignore keywords | frozen data |
| `core/value-nodes.js` | walking a declaration value (`postcss-value-parser`) with the rules for math functions, token functions and keywords | callbacks over value nodes |
| `core/options.js` | option schemas, defaults, normalisation, per-property scale resolution | a built options object; validation against Stylelint happens in `rules/validate.js` |
| `core/token-sources.js` | reading tokens from CSS custom properties, Sass variables and maps, flat JSON, Style Dictionary and DTCG files; value normalisation keys | `{ token, value }` entries; definitions keyed by token name |
| `core/token-map.js` | the effective value-to-token map a rule uses to suggest a token | value key to token name |
| `core/scale-inference.js` | `scale: "auto"`: the source order, the plausibility check, package discovery, caches | an inference `{ scale, source, files, rejected? }` |
| `core/tailwind-class-analysis.js`, `core/tailwind-motion-analysis.js` | reading spacing and motion out of Tailwind class strings | analyses per class segment |

Conversions between representations happen at explicit points: `getNormalizedValueKeys` in token sources, `normalizeScale` in length, `toAuditContractReport` in the audit. Nothing else re-derives them.

## The rule kit

A Stylelint rule in this repository is an assembly of primitives, not a copy of another rule:

1. `validatePrimary` and one `validate<Rule>SecondaryOptions` from `rules/validate.js` (schemas live in core).
2. `build<Kind>Options` from `core/options.js`, then `withResolvedScale(options, root)` if the rule takes a scale.
3. `createPropertyScaleResolver(options)` for the per-property scale.
4. A walk over declarations with `walkRootValueNodes` or `walkTransformTranslateNodes`.
5. `fixedLengthValue` for the replacement text, `reportValueNode` from `rules/report.js` to report it.

`use-scale` is the reference implementation. A fifth rule should read like it. If a fifth rule needs something two existing rules already do in slightly different ways, the fix is a new primitive in core, not a third variant.

Messages are part of the public contract. They name the value, the two nearest steps and, once per file, why the scale came from a preset. The audit parses them back into findings, so a message change is a breaking change for the audit's finding types and must be made in both places.

## The audit

`src/audit/` is the project-level product: it runs the rules through Stylelint's API over a directory, adds Tailwind class-string analysis for template files, recovers the CSS property of each finding from the source, infers one project-level scale with provenance, builds a token contract, compares against a baseline, and renders. The JSON 2.0 contract (`contracts.scale`, `contracts.tokens`, `findings`, `summary`) is stable across minors; renderers (`render-*.js`) are pure functions of the report. `src/audit/args.js` is a table of options from which `--help` is rendered.

## Invariants and where they are enforced

| Invariant | Enforced by |
| --- | --- |
| Layer direction, no cycles, no framework in core, every runtime import declared | `test/contracts/architecture.test.js` |
| `require` and `import` yield the same module for every export subpath; types exist | `test/contracts/exports.test.js` |
| Every rule has a docs page and `meta.url` points at it | `test/contracts/rule-docs.test.js` |
| Every audit flag is documented; three spellings parse the same | `test/unit/audit-args.test.js` |
| A number never loses its trailing zeros in any message or fix | `test/unit/length-format.test.js` |
| Behaviour on 57 real design systems does not move without review | `npm run bench:quiet -- --check`, Quiet Benchmark workflow |
| Stylelint 16.0.0 still works | `npm run test:compat-floor`, CI matrix |
| The published tarball installs and runs | `npm run test:pack-smoke`, post-publish smoke workflow |
| Agent packs match the docs block they are generated from | `test/cli/agent-packs.test.js` |

## Performance

Linting runs per file in editors and hooks, so per-file work must be small:

- Token sources and Tailwind configs are parsed once per process and cached by path and base font size (`sourceCache`).
- Project discovery (walking to the repository root, reading `package.json`, checking installed token packages, reading `.rhythmguardrc.json`) is cached per cwd and revalidated by mtime of every file it consulted: a `stat` per file instead of a read, a parse and a walk.
- Scale normalisation is cached per property within a file (`createPropertyScaleResolver`).
- Value walking is a single pass with `postcss-value-parser`; no regex re-scan of the declaration.

`npm run bench:perf` measures rule throughput against `stylelint-scales` on a deterministic corpus; `benchmarks/latest.json` is the last run. Anything that touches a hot path should come with a number from it.

## Correctness notes that are easy to undo by accident

- Percentages and hairlines (one CSS pixel or less) are not findings by default; the benchmark showed both classes are always intentional. `allowHairlines: false` and `allowPercentages: false` exist for teams that want them.
- An inferred scale must pass `assessScale` (three or more steps, mostly whole pixels, a common step, not mostly component files). Without it, component-local variables become the project scale. The rule says why it fell back; the audit reports `contracts.scale.rejected`.
- Sass names are anchored (`$spacer`, `$spacing-*`, `$space-*`, optional `system-` prefix) and namespaced maps are accepted only with four or more lengths, because `$dropdown-spacer` is a component variable and `$govuk-spacing-points` is a scale.
- Only the first Tailwind `--spacing` base is expanded. A union of ladders from several theme files is a scale nobody designed.
- Unitless Sass numbers are multipliers or map indices, never lengths.
- `formatNumber` prints `String(rounded)`. The previous trailing-zero strip turned `30px` into `3px` in every release before 3.3.0.

## Compatibility and public surface

Public: the package exports listed in `package.json` (root plugin, five configs, presets, audit API, four rules, ESLint companion), their TypeScript declarations under `types/`, rule messages, the audit JSON 2.0 contract and CLI flags. Everything under `src/core` is internal; it may change between minors even though it is reachable by path. Semver policy is in CONTRIBUTING.

## Adding things

- **A rule:** copy the shape of `src/rules/use-scale/index.js`, register it in `src/index.js`, add `src/rules/<name>/index.mjs` and the `exports` entry, a page under `docs/rules/`, a test under `test/rules/`. The contract tests will tell you what you forgot.
- **A token source format:** a parser in `core/token-sources.js` returning `{ token, value }` entries, a fixture test under `test/unit/`, and a benchmark repository that uses it.
- **A scale preset:** `scales/community/` through `npm run scales:add`.
- **An audit output format:** a `render-<format>.js` that is a pure function of the report, one dispatch line in `src/cli/audit.js`, an entry in the option table.
- **A framework adapter:** a new top-level directory that imports only from `core` and `presets`, plus a row in the architecture test's allow-list.
