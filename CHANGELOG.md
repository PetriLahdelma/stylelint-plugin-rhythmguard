# Changelog

All notable changes to `stylelint-plugin-rhythmguard` will be documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [Unreleased]

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
