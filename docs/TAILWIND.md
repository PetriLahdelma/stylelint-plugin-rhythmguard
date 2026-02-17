# Tailwind Integration Guide

This guide describes the production setup for Rhythmguard in Tailwind-based codebases.

## Scope Model

- Rhythmguard enforces CSS declaration values that Stylelint can parse.
- Tailwind class strings in markup (`class="p-4"` / `className="p-[13px]"`) are out of scope for Stylelint rules.

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

Use an ESLint plugin for Tailwind utility class strings:

- `eslint-plugin-tailwindcss` for class-string governance and arbitrary-value controls.

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
