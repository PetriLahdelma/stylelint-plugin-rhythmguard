---
title: Why Your Tailwind Project Leaks Spacing (And How to Fix It in 5 Minutes)
published: false
tags: tailwindcss, css, designsystems, webdev
cover_image: https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.svg?v=3
---

Every Tailwind project starts clean. `p-4`, `gap-2`, `m-8` — the spacing scale holds.

Then someone writes `p-[13px]`.

Then another dev adds `gap-[7px]` because "it just looks better." Then a third person commits `margin: 15px` in a CSS Module because they didn't know about the scale.

Six months later, `git grep` finds 47 unique spacing values across 200 files. Your 8pt grid is a suggestion, not a rule.

**This is spacing drift.** It happens in every project that relies on convention instead of enforcement.

## The problem with Tailwind's arbitrary values

Tailwind v4 made CSS-first configuration the default. That's great for tokens:

```css
@theme {
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
}
```

But nothing stops a developer from writing `p-[13px]` in a component. Prettier won't catch it. ESLint won't catch it. TypeScript won't catch it.

Tailwind gives you a scale. It doesn't enforce it.

## What Rhythmguard does

[Rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard) is a Stylelint plugin that enforces your spacing scale and design tokens in both CSS declarations and Tailwind class strings.

Three rules, one purpose:

| Rule | What it catches |
|------|----------------|
| `use-scale` | `padding: 13px` → "Use 12px or 16px" |
| `prefer-token` | `gap: 16px` → "Use var(--spacing-4)" |
| `no-offscale-transform` | `translateY(18px)` → "Use 16px or 24px" |

All three autofix. `13px` becomes `12px`. `16px` becomes `var(--spacing-4)`. No manual cleanup.

## Setup: 5 minutes for a Next.js + Tailwind project

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

**.stylelintrc.json:**

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/react-tailwind"]
}
```

That's it for CSS files. For Tailwind class strings in JSX/TSX, add the ESLint companion:

**eslint.config.js:**

```js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': [
        'error',
        { scale: [0, 4, 8, 12, 16, 24, 32] }
      ],
    },
  },
];
```

Now `p-[13px]` in your JSX gets caught and autofixed to `p-[12px]`.

## Tailwind v4: Zero-config token governance

If your project uses Tailwind v4 with `@theme` blocks:

```css
@theme {
  --spacing-4: 16px;
  --spacing-3: 12px;
}
```

Rhythmguard automatically extracts these as token mappings. When you write `padding: 16px`, it autofixes to `padding: var(--spacing-4)`. No `tokenMap` config needed.

## Before/after: a real CSS Module

**Before:**

```css
.card {
  padding: 13px;
  margin-bottom: 7px;
  gap: 15px;
  border-radius: 5px;
}
```

**After autofix:**

```css
.card {
  padding: 12px;
  margin-bottom: 8px;
  gap: 16px;
  border-radius: 4px;
}
```

**After token migration:**

```css
.card {
  padding: var(--spacing-3);
  margin-bottom: var(--spacing-2);
  gap: var(--spacing-4);
  border-radius: var(--radius-1);
}
```

## Audit before you enforce

Not ready to enforce yet? Run an audit first:

```bash
npx rhythmguard audit ./src
```

```
Rhythmguard Audit: ./src

Files scanned:     47
Files with issues: 12 (25%)

Off-scale values: 34
  13px       ×8
  7px        ×6
  15px       ×5

Token opportunities: 18
  16px → var(--spacing-4)  ×9
  8px  → var(--spacing-2)  ×5
```

Paste this in a PR description. Your team lead will understand the problem immediately.

## Works with your tools

Rhythmguard supports the token workflows modern teams actually use:

- **Tailwind v4 @theme** — auto-extracted, zero config
- **Tailwind v3 config** — reads `theme.spacing` from JS config
- **W3C DTCG tokens** — Style Dictionary, Tokens Studio, Figma Variables export
- **CSS custom properties** — `var(--space-*)` from any source
- **cn/clsx/cva/twMerge** — ESLint rule catches arbitrary values in all utility helpers

Framework configs for [React/Next.js, Vue, Lit, Astro, SvelteKit](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FRAMEWORKS.md).

## Why not just use Prettier / eslint-plugin-tailwindcss?

**Prettier** orders your classes. It doesn't know if `p-[13px]` is on your scale.

**eslint-plugin-tailwindcss** checks class name conventions. It doesn't enforce *which values* are allowed in arbitrary brackets.

**Rhythmguard** is the only tool that governs the actual spacing values — in CSS declarations AND in Tailwind class strings.

## Get started

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
npx rhythmguard init
npx rhythmguard audit ./src
```

Three commands. Five minutes. Your spacing scale becomes a rule, not a suggestion.

GitHub: [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard)
npm: [stylelint-plugin-rhythmguard](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
