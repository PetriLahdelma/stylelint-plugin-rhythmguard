# Changelog

All notable changes to `stylelint-plugin-rhythmguard` will be documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [Unreleased]

### Added

- Added `scale: "auto"` to `rhythmguard/use-scale`, `rhythmguard/no-offscale-transform` and `rhythmguard/prefer-token`. The scale is inferred from spacing tokens: `scaleSources` files, then `.rhythmguardrc.json` audit token sources, then the linted stylesheet's custom properties, then `tailwindConfigPath`, with a `rhythmic-4` fallback that is announced in the first report of the file. First matching source wins.
- Added the `scaleSources` rule option and made `tailwindConfigPath` available to every scale rule.
- Added `rhythmguard audit --scale auto`, which infers one project-level scale from token sources, then spacing custom properties across the scanned CSS, then the default. The JSON contract now carries `contracts.scale.values`, `source` and `files`; text and Markdown output print the scale and its source.
- Added the quiet benchmark (`npm run bench:quiet`): audits public design systems with `--scale auto`, classifies findings as drift, noise or allowance, and writes `docs/QUIET_BENCHMARK.md` with a per-repo false-positive rate. Manifest and classification rules live in `benchmarks/quiet/`.
- Scale inference now reads token values written as `calc(<length> * var(--factor))` (Radix Themes), expands a bare Tailwind v4 `--spacing` base into the default multiplier scale, and matches prefixed spacing tokens such as `--lb-spacing-md` while excluding `letter-spacing` and `word-spacing`.

### Fixed

- `rhythmguard/prefer-token` no longer reports percentages such as `translate(-50%, -50%)` or `inset: 100%` as raw scale values. Percentages are never token candidates. This was the largest noise source in the quiet benchmark.
- `rhythmguard/use-scale` with `allowPercentages: false` now reports percentage lengths instead of silently skipping them.

## [2.1.0] - 2026-09-05

### Added

- Added `rhythmguard audit --format github`, emitting GitHub Actions workflow-command annotations (one `::warning` per finding, a `::notice` summary) for inline PR feedback without a formatter dependency.
- Added per-rule documentation pages under `docs/rules/` for every Stylelint and ESLint rule. Rule `meta.url` and ESLint `meta.docs.url` now point at them, and a test enforces the link.
- Added `npm run typecheck`: compiles the published TypeScript declarations, a consumer check file, and the packaged examples.
- Added Stylelint 17 to the CI and release matrices (Node 20 and 22; Node 18 is excluded for Stylelint 17).
- Added a bug-report issue template.

### Changed

- README cut from 833 lines to a quick start. Config details, scale presets, the audit reference and the full custom setup moved to `docs/CONFIGS.md`, `docs/SCALE_PRESETS.md` and `docs/AUDIT.md`; development and release notes moved to `CONTRIBUTING.md`.
- Split the audit CLI into focused modules under `src/audit/`; `src/cli/audit.js` is now a thin command shell. No behaviour change.
- Release, post-publish smoke and community-scale workflows now run on the self-hosted runners like CI.

### Fixed

- `plugin.configs` and the ESM entry now expose `react-tailwind`, matching the `./configs/react-tailwind` package export. A test asserts parity between package exports and the programmatic configs object.
- `AuditOptions` declaration: `config` and `output` were never read by the audit API and are replaced by the real keys `configPath` and `outputPath`; `noConfig` and `tokenSourceFormat` added.

## [2.0.1] - 2026-06-17

### Added

- Added TypeScript declaration files for the public plugin, config, rule, preset, ESLint companion, and Audit 2.0 API exports.
- Added dependency-free Audit 2.0 dashboard and Figma-friendly export examples under `examples/`.
- Added CI adoption and motion-default evidence docs for safer baseline-based rollout.

### Fixed

- Fixed `rhythmguard init` scripted input handling so multiple prompts work reliably in piped/CI contexts.

## [2.0.0] - 2026-05-23

### Changed

- `rhythmguard audit --format json` now emits the stable audit contract with `schemaVersion: "2.0"`.
- Moved the pre-2.0 audit JSON shape to `--format json-v1` for migration compatibility.
- Updated audit defaults to use the explicit spacing token pattern `^--(space|spacing)-`.

### Added

- Added `stylelint-plugin-rhythmguard/audit` with `createAuditReport`, `loadAuditConfig`, `parseTokenSources`, and `toAuditContractReport`.
- Added `rhythmguard audit --format html`, `--output <file>`, and `--schema`.
- Added `rhythmguard doctor` checks for `.rhythmguardrc.json`, configured token sources, motion audit config, and baseline files.
- Added `docs/MIGRATING_TO_2.md`.

## [1.9.0] - 2026-05-23

### Added

- Added opt-in `rhythmguard/use-motion-scale` for duration/delay scale enforcement and raw easing reporting.
- Added `stylelint-plugin-rhythmguard/configs/motion`.
- Added ESLint companion rule `rhythmguard-tailwind/tailwind-class-use-motion-scale` for Tailwind `duration-[...]`, `delay-[...]`, and `ease-[...]` arbitrary values.
- Added `rhythmguard audit --include-motion` and `.rhythmguardrc.json` `includeMotion` support.

## [1.8.0] - 2026-05-23

### Added

- Added `.rhythmguardrc.json` audit config loading with `--config` and `--no-config`.
- Added external audit token sources with `--token-source`, `--token-source-format`, and `--token-kind`.
- Added token source parsing for CSS custom properties, Tailwind v4 `@theme`, flat JSON, Style Dictionary JSON, and DTCG JSON.
- Expanded audit token-contract reporting with loaded source metadata, raw values that match known tokens, and conflicting token values.

## [1.7.0] - 2026-05-23

### Added

- Added audit baseline workflows with `--write-baseline`, `--since-baseline`, and `--fail-on-new-drift` for legacy-safe CI adoption.
- Added changed-only audit scopes with `--staged` and `--since <git-ref>`.
- Added CI threshold gates with `--max-findings` and `--min-cleanliness`.
- Added `.rhythmguardignore` / `--ignore-path` support for reusable root-relative scan pruning.
- Added token contract reporting for spacing tokens used but missing, tokens defined but unused, and repeated raw value candidates.

## [1.6.1] - 2026-05-23

### Fixed

- Added `rhythmguard audit --ignore` for pruning root-relative paths before scanning large repositories.
- Scoped audit traversal to scan-relevant CSS and template files instead of collecting every file under the audit root first.
- Added default audit skips for common generated directories such as `.svelte-kit`, `.turbo`, and `.vercel`.

## [1.6.0] - 2026-05-19

### Added

- `rhythmguard audit` now reports design-system drift across CSS declarations and Tailwind arbitrary spacing class strings.
- Added `--format markdown` / `--markdown` audit output for PR-ready design-system health reports.
- Audit JSON now includes format version, CSS findings, Tailwind class-string findings, scan counts, top affected files, and summary totals while preserving existing top-level count fields.

## [1.4.2] - 2026-02-21

### Changed

- npm package artifact is now leaner by excluding non-runtime media assets from published files.
- README media links now use absolute GitHub URLs so npm README rendering remains intact without bundling local media files.
- Added a dedicated "Drop-In for Existing Projects" path with a single install command and a single config block.
- Added comparison and migration guidance:
  - `docs/COMPARISON.md` (`defensive-css` vs `logical-css` vs Rhythmguard + migration recipes)
  - `docs/ADOPTION_DIFFS.md` (real before/after excerpts from public codebases)
- Added Dev.to publishing assets:
  - `docs/DEVTO_ORIGINAL_UPDATE_NOTE_2026-02-21.md`
  - `docs/DEVTO_CONTINUATION_2026-02-21.md`

## [1.4.1] - 2026-02-21

### Fixed

- `properties` now correctly supports regex-like string entries (for example `"/^(margin|padding)$/"`) in rule options.
- Property matcher behavior is now deterministic for regex matchers with stateful `g`/`y` flags by normalizing stateful behavior during matching.
- Generic rule messaging for expanded property groups:
  - `rhythmguard/use-scale` now reports off-scale values without spacing-only wording.
  - `rhythmguard/prefer-token` now reports raw scale values without spacing-only wording.

## [1.4.0] - 2026-02-21

### Added

- New shared configs:
  - `stylelint-plugin-rhythmguard/configs/expanded`
  - `stylelint-plugin-rhythmguard/configs/logical`
  - `stylelint-plugin-rhythmguard/configs/migration`
- New ESLint companion export: `stylelint-plugin-rhythmguard/eslint` with rule:
  - `rhythmguard-tailwind/tailwind-class-use-scale`
- Token migration source automation for `rhythmguard/prefer-token`:
  - `tokenMapFromCssCustomProperties`
  - `tokenMapFile`
  - `tokenMapFromTailwindSpacing` + `tailwindConfigPath`
- ESM wrapper entry points for package root, configs, presets, rules, and ESLint companion.

### Changed

- Broadened scale enforcement model with built-in property groups:
  - `spacing`, `radius`, `typography`, `size`
- New per-property override options:
  - `propertyGroups`
  - `propertyScales`
- New math-function targeting options:
  - `mathFunctionArguments`
  - `ignoreMathFunctionArguments`
- New `unitStrategy` option (`convert` or `exact`) for non-convertible unit workflows.
- Compatibility updated to support Stylelint `^16 || ^17`.
- Tailwind token-map extraction now supports `.js`, `.cjs`, and `.mjs` config files and merges `theme.spacing` with `theme.extend.spacing`.

## [1.3.0] - 2026-02-17

### Added

- Strict `secondaryOptions` validation for all three rules:
  - `rhythmguard/use-scale`
  - `rhythmguard/prefer-token`
  - `rhythmguard/no-offscale-transform`
- Invalid option names (for example `sevverity`) now fail with Stylelint invalid option warnings instead of silently being ignored.
- Type/shape validation for option payloads (for example `properties` must be an array, `tokenMap` must be an object).
- Regression tests for invalid secondary option names and option value shapes.

### Changed

- Added `known-css-properties` as a direct runtime dependency to guarantee `properties` option validation in consumer installs.
- `properties` option validation now checks supported spacing property names against known CSS property metadata (plus `translate-x`, `translate-y`, `translate-z`).

## [1.2.1] - 2026-02-17

### Fixed

- Ignore invalid unitless non-zero literals (`margin: 13`) across all rules instead of treating them like `px` and autofixing them.
- Reduced strict-mode transform overlap by scoping `rhythmguard/use-scale` away from transform properties in the shared strict config.
- `rhythmguard/prefer-token` now supports `enforceInsideMathFunctions` for optional math-function enforcement.
- Hardened `var()` token argument detection to parse the first argument structurally (rather than comma string splitting).
- npm README link integrity: docs links now resolve to absolute GitHub URLs from the npm package page.
- Release workflow now detects missing `NPM_TOKEN` and skips publish cleanly with an explicit notice instead of failing.

### Added

- Dev.to article link in README resources:
  - https://dev.to/petrilahdelma/enforcing-your-spacing-standards-with-rhythmguard-a-custom-stylelint-plugin-1ojj
- Regression tests covering:
  - unitless non-zero handling in all three rules
  - strict transform overlap guard
  - prefer-token math-function enforcement toggle

## [1.2.0] - 2026-02-17

### Added

- Tailwind integration guidance in README:
  - exact enforcement boundary (CSS declarations vs class strings)
  - recommended layered setup with `stylelint-config-tailwindcss`, `eslint-plugin-tailwindcss`, and `prettier-plugin-tailwindcss`
  - architecture direction for thorough Tailwind coverage.
- New shared config entry point: `stylelint-plugin-rhythmguard/configs/tailwind`.
- Tailwind-oriented test coverage for transform token functions and nested translate values.

### Changed

- Hardened transform translate parsing to handle nested function values consistently.
- `use-scale` and `no-offscale-transform` now respect `enforceInsideMathFunctions` in transform translation contexts.

## [1.1.0] - 2026-02-17

### Added

- `CODEOWNERS` for repository ownership and review routing.
- Post-publish npm smoke workflow to validate clean-project install and lint execution from the registry.
- Non-blocking full-suite observability on Stylelint `16.0.0` in CI/release verification.
- Community scale registry with JSON schema, CI validation, and scaffolding script.
- Community contribution workflow assets:
  - `docs/COMMUNITY_SCALES.md`
  - `scales/community/*.json`
  - `scripts/scales/add-scale.mjs`
  - `scripts/scales/validate-community-scales.mjs`
  - scale request issue template.

### Changed

- Preset loader now includes validated community scale files from `scales/community`.
- Exported preset helpers now include:
  - `listCommunityScalePresetNames()`
  - `getCommunityScaleMetadata(name)`

## [1.0.0] - 2026-02-17

### Changed

- Promoted the package to `1.0.0` to signal production-ready stability for rule behavior, config entry points, and autofix determinism.
- Added explicit public bug-report/support contact: `hello@petrilahdelma.com`.
- Added npm metadata bug-report email for direct reporting via package details.

## [0.1.1] - 2026-02-16

### Changed

- Removed the Visual System Note section from README.
- Added `CONTRIBUTING.md` with semver, release, and rule-change guidance.
- Added CI/release matrix validation for Node (`18.18.2`, `20.x`, `22.x`) and Stylelint (`16.0.0`, latest `16`).
- Added tarball pack smoke test to validate packaged exports and real install flow.
- Updated npm package description metadata.

## [0.1.0] - 2026-02-16

### Added

- Core spacing governance rules:
  - `rhythmguard/use-scale`
  - `rhythmguard/prefer-token`
  - `rhythmguard/no-offscale-transform`
- Autofix support for deterministic nearest-scale replacement and explicit token map replacement.
- Built-in config entry points:
  - `stylelint-plugin-rhythmguard/configs/recommended`
  - `stylelint-plugin-rhythmguard/configs/strict`
- Built-in scale presets and aliases across product, editorial, and modular/theory-driven systems.
- Preset helpers exported via `stylelint-plugin-rhythmguard/presets`.
- Unit tests, coverage reports, and benchmark scripts.
- Release workflow with npm provenance publishing.
