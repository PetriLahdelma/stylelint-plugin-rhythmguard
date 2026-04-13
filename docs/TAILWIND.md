# Tailwind Integration Guide

This guide describes the production setup for Rhythmguard in Tailwind-based codebases.

## Scope Model

- Rhythmguard Stylelint rules enforce CSS declaration values that Stylelint can parse.
- Rhythmguard ESLint companion rules enforce Tailwind class-string arbitrary values in templates.

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
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: {
      'rhythmguard-tailwind': rhythmguard,
    },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

Then layer on:

- `eslint-plugin-tailwindcss` for broader class-string governance and conventions.

Use Prettier for deterministic ordering:

- `prettier-plugin-tailwindcss`.

## Recommended Files To Lint With Rhythmguard

- `src/**/*.css`
- `src/**/*.module.css`
- authored `@layer components` and `@layer utilities` CSS

## Typical CI Sequence

1. Stylelint (Rhythmguard) over CSS declarations.
2. ESLint over JS/TS/JSX/TSX templates.
3. Prettier check.

This gives complete spacing governance without mixing parser responsibilities.
