# Tailwind Integration Guide

This guide describes the production setup for Rhythmguard in Tailwind-based codebases.

## Scope Model

- Rhythmguard Stylelint rules enforce CSS declaration values that Stylelint can parse.
- Rhythmguard ESLint companion rules enforce Tailwind class-string arbitrary values in templates, and offer the utility classes for the two nearest steps (`p-3`, `p-4` for `p-[13px]`) as editor suggestions; `fixOffScale: "nearest"` makes `--fix` write the nearest one.

## Tailwind v4 (@theme support)

Tailwind v4 defines spacing tokens as CSS custom properties inside `@theme` blocks:

```css
@theme {
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
}
```

The `tailwind` config preset automatically extracts these as token mappings. No extra config needed:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

With this config, `padding: 16px` will be flagged and autofixed to `padding: var(--spacing-4)`.

### Tailwind v3 compatibility

Tailwind v3 projects using `tailwind.config.js` can continue using `tokenMapFromTailwindSpacing` with `tailwindConfigPath`. Both sources can coexist — explicit `tokenMap` and file-based maps always take precedence.

## Recommended Layered Setup

### 1) Stylelint layer (CSS declarations)

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

This gives:

- Tailwind-aware Stylelint syntax/config behavior via `stylelint-config-tailwindcss`.
- Rhythmguard strict spacing/token enforcement for authored CSS declarations.

### 2) Template class-string layer

Use the built-in Rhythmguard ESLint companion for arbitrary spacing classes:

```js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: {
      'rhythmguard-tailwind': rhythmguard,
    },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

`files` and `ecmaFeatures.jsx` make ESLint lint `.jsx`. TypeScript, Vue, Svelte and Astro need their parser: see [Other file types](../packages/eslint-plugin-rhythmguard/README.md#other-file-types).

If you run Oxlint instead, load the same rule as a JS plugin:

```json
// .oxlintrc.json
{
  "jsPlugins": [{ "name": "rhythmguard-tailwind", "specifier": "eslint-plugin-rhythmguard" }],
  "rules": {
    "rhythmguard-tailwind/tailwind-class-use-scale": ["error", { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

CI runs this config on Oxlint 1.93.0, on TSX, for findings, their locations, `--fix` and `--fix-suggestions` (which writes the nearest step). Oxlint's JS plugins are alpha, and in Vue, Svelte and Astro files Oxlint lints only the `<script>` blocks, so class strings in templates are not checked there; keep ESLint for those files.

Then layer on:

- `eslint-plugin-tailwindcss` for broader class-string linting and conventions. Its `tailwindcss/no-arbitrary-value` rule is useful when a project wants to reject all arbitrary values; Rhythmguard's companion rule is narrower and checks arbitrary spacing values against your configured scale.

Use Prettier for deterministic ordering:

- `prettier-plugin-tailwindcss`.

## With @shadcn/lint and Tailwind canonical classes

Tailwind v4 accepts any quarter step of `--spacing` as a plain class, so 13px can be written `p-3.25`. @shadcn/lint's `no-arbitrary-values` answers `p-[13px]` with that class, "same value, on the scale", and Tailwind's `canonicalize` rewrites `p-[0.8125rem]`, the same 13px, to it. Both are right about the spelling. Neither asks whether 13px is a step your design system allows, which is the question Rhythmguard answers. The three run side by side.

### What each tool owns

Measured with `node scripts/bench/tailwind-compare.mjs` (default Tailwind theme, Rhythmguard on the scale `[0, 4, 8, 12, 16, 24, 32]`; [full table](../benchmarks/tailwind-compare/RESULTS.md)):

| | Tailwind CLI 4.3.4 `canonicalize` | @shadcn/lint 0.2.5 | Rhythmguard |
| --- | --- | --- | --- |
| Owns | The canonical spelling of a class | Component contracts and arbitrary values of every kind, in class strings | Whether a spacing value is a step of your scale, in class strings and stylesheets, and the baseline |
| Reads | The classes you pass it | JSX, TSX, Vue and Svelte class sites, as an ESLint or Oxlint plugin; not stylesheets | Class strings (ESLint or Oxlint), CSS and SCSS (Stylelint), both in the audit |
| `p-[13px]` | unchanged | Use `p-3.25` "(same value, on the scale)" | Use `p-3` (12px) or `p-4` (16px) |
| `p-[0.8125rem]` | rewrites to `p-3.25` | Use a theme token or scale value | Use `p-3` (12px) or `p-4` (16px) |
| `p-[12px]` | unchanged | Use `p-3` | no finding: 12px is on the scale |
| `p-3.25` | unchanged | no finding | no finding |
| Baseline | none needed: it rewrites | none in its README; [shadcn-ui/lint#19](https://github.com/shadcn-ui/lint/issues/19) asks for a suppression comment | `rhythmguard audit --write-baseline`, or ESLint's bulk suppressions |

### Why `p-3.25` matters

Rhythmguard's `spacingUnit` is the same unit as Tailwind's `--spacing`: px per step, `baseFontSize / 4` by default, so 4px on a 16px root. The rule uses it to name the classes for the two nearest steps of your scale, `p-3` for 12px and `p-4` for 16px. A step that is a whole number of quarter units gets a plain class (a 13px step on your scale would be written `p-3.25`); any other step stays bracketed (`p-[13.5px]`). Set `spacingUnit` when your `--spacing` is not `0.25rem`.

The rule checks bracketed values only. A bare `p-3.25` passes it, as it passes every tool in the table, so once `p-[13px]` has been rewritten to `p-3.25` no linter here reports the 13px. Two habits keep the value visible:

- Let Rhythmguard own arbitrary spacing classes (the config below), so the first answer to `p-[13px]` is a step of your scale.
- Do not apply a `p-3.25`-style suggestion or `canonicalize` rewrite to a spacing class that Rhythmguard reports; pick one of the two steps it names.

### One config, each value reported once

`no-arbitrary-values` takes an `allow` list of class groups. Allow the spacing utilities Rhythmguard checks, and @shadcn/lint keeps every other arbitrary value: widths, colors, type sizes, radii.

```js
// eslint.config.js
import { plugin as shadcn } from '@shadcn/lint';
import rhythmguard from 'eslint-plugin-rhythmguard';

// The utilities tailwind-class-use-scale checks; @shadcn/lint leaves them to it.
const spacingUtilities = [
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'inset', 'inset-x', 'inset-y', 'top', 'right', 'bottom', 'left',
  'translate-x', 'translate-y',
  'scroll-m', 'scroll-mx', 'scroll-my', 'scroll-mt', 'scroll-mr', 'scroll-mb', 'scroll-ml',
  'scroll-p', 'scroll-px', 'scroll-py', 'scroll-pt', 'scroll-pr', 'scroll-pb', 'scroll-pl',
];

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { shadcn, 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'shadcn/no-arbitrary-values': ['error', { allow: spacingUtilities }],
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

The comparison script runs this block as written, on a JSX file of spacing, width, color and radius classes with variants and negative values, and checks that no class is reported twice ("Both together" in [RESULTS.md](../benchmarks/tailwind-compare/RESULTS.md)). One trade: @shadcn/lint no longer asks for `p-3` in place of `p-[12px]`, and Rhythmguard does not either, since 12px is on the scale. Add @shadcn/lint's own configs and settings (`components.json`, `themeImports`) to the same block as its README describes; TypeScript, Vue and Svelte files need their parser, as in [Other file types](../packages/eslint-plugin-rhythmguard/README.md#other-file-types).

### Baselines

@shadcn/lint does not read stylesheets, so the stylesheet side stays with Stylelint and the audit, whose baseline covers class strings too:

```bash
npx rhythmguard audit . --write-baseline
npx rhythmguard audit . --since-baseline --fail-on-new-drift
```

For the ESLint side alone, ESLint's bulk suppressions (ESLint 9.24 or newer) record today's findings for both plugins, so CI fails only on new ones:

```bash
npx eslint --suppress-rule rhythmguard-tailwind/tailwind-class-use-scale --suppress-rule shadcn/no-arbitrary-values .
```

## Recommended Files To Lint With Rhythmguard

- `src/**/*.css`
- `src/**/*.module.css`
- authored `@layer components` and `@layer utilities` CSS

## Typical CI Sequence

1. Stylelint (Rhythmguard) over CSS declarations.
2. ESLint over JS/TS/JSX/TSX templates.
3. Prettier check.

This covers spacing in both CSS and class strings without mixing parser responsibilities.
