# Changelog

All notable changes to `stylelint-plugin-rhythmguard` will be documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [Unreleased]

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
