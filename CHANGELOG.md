# Changelog

All notable changes to `stylelint-plugin-rhythmguard` will be documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [Unreleased]

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
