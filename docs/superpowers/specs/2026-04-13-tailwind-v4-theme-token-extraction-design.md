# Design Spec: Tailwind v4 @theme Token Extraction

Date: 2026-04-13
Phase: 2 — Product Gaps
Status: Approved

## Goal

Enable `prefer-token` to automatically build token mappings from Tailwind v4 `@theme` blocks in CSS, so Tailwind v4 projects get zero-config token governance.

## What Changes

`tokenMapFromCssCustomProperties` gains the ability to scan inside `@theme` at-rules, not just root-level custom property declarations. When it finds `--spacing-4: 16px` inside `@theme {}`, it builds a token map entry: `"16px" → "var(--spacing-4)"`.

## How It Works

### PostCSS Walking

The existing CSS custom property scanner in `token-map.js` currently walks `Declaration` nodes matching `tokenPattern`. It needs to also walk declarations inside `@theme` at-rules. PostCSS models `@theme { --spacing-4: 16px }` as an `AtRule` node with child `Declaration` nodes.

### Token Map Entry Format

Tokens discovered in `@theme` map to `var(--prop-name)`. Tokens discovered from Tailwind JS config continue mapping to `theme(spacing.x)`. The source determines the output format — auto-detected, no config needed.

### Tailwind Config Preset Update

`configs/tailwind.js` enables `tokenMapFromCssCustomProperties: true` and sets `tokenPattern: "^--spacing"` by default. This means Tailwind v4 projects using the `tailwind` preset get automatic token extraction with no extra config.

### Backwards Compatibility

Tailwind v3 projects using `tokenMapFromTailwindSpacing` with a JS config are unaffected. The two sources merge with the existing precedence: explicit `tokenMap` > file > CSS custom properties > Tailwind config.

## Files Touched

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/token-map.js` | Modify | Extend `buildTokenMapFromCssCustomProperties` to walk `@theme` at-rules |
| `src/configs/tailwind.js` | Modify | Enable `tokenMapFromCssCustomProperties` and set spacing token pattern |
| `src/configs/tailwind.mjs` | Modify | ESM wrapper — keep in sync with CJS config |
| `test/prefer-token.test.js` | Modify | Add tests for `@theme` block extraction and autofix output |

## Out of Scope

- No new config option — reuses existing `tokenMapFromCssCustomProperties`
- No `@theme` parsing outside Stylelint's PostCSS pipeline — we use the AST that's already there
- No support for non-spacing `@theme` tokens (colors, fonts) — `tokenPattern` already filters these out
- No changes to `use-scale` or `no-offscale-transform` rules

## Testing Strategy

1. `@theme { --spacing-4: 16px }` + `tokenMapFromCssCustomProperties: true` → `padding: 16px` autofixes to `padding: var(--spacing-4)`
2. Mixed `@theme` and root-level custom properties both get picked up
3. Tailwind v3 JS config path still works (regression)
4. Explicit `tokenMap` still wins over `@theme`-derived map (precedence)
5. `tokenPattern` correctly filters non-spacing `@theme` variables (e.g. `--color-*` ignored)
6. Negative values: `margin: -16px` autofixes to `calc(var(--spacing-4) * -1)` or `calc(-1 * var(--spacing-4))`

## Success Criteria

- A Tailwind v4 project using `extends: ["stylelint-plugin-rhythmguard/configs/tailwind"]` gets automatic `@theme` token enforcement with no additional config
- Autofix output uses `var()` for `@theme` tokens and `theme()` for JS config tokens
- All existing tests continue to pass
