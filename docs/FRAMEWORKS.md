# Framework Integration Guide

Rhythmguard configs for common frontend frameworks. Use the shipped config for React/Next.js, or copy a snippet for Vue, Lit, or Astro.

## React / Next.js + Tailwind

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"],
  "ignoreFiles": [".next/**", "out/**", "node_modules/**"]
}
```

This gives you:

- Tailwind-aware Stylelint configuration
- Spacing scale and token enforcement on all CSS files
- Expanded enforcement (spacing + radius) on CSS Modules (`*.module.css`)
- `.next/` and `out/` build directories ignored

Pair with the ESLint companion to check Tailwind class strings in JSX/TSX:

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': [
        'error',
        { scale: [0, 4, 8, 12, 16, 24, 32] },
      ],
    },
  },
];
```

## Vue (config snippet)

Vue Single File Components need `postcss-html` to parse `<style>` blocks.

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard postcss-html
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"],
  "overrides": [
    {
      "files": ["**/*.vue"],
      "customSyntax": "postcss-html"
    }
  ]
}
```

Lint command:

```bash
npx stylelint "src/**/*.{css,vue}"
```

## Lit (config snippet)

Lit templates use tagged template literals for CSS. Use `postcss-lit` to parse them.

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard postcss-lit
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"],
  "overrides": [
    {
      "files": ["**/*.ts", "**/*.js"],
      "customSyntax": "postcss-lit"
    }
  ]
}
```

Lint command:

```bash
npx stylelint "src/**/*.{css,ts,js}"
```

## Astro (config snippet)

Astro components embed `<style>` blocks similar to Vue. Use `postcss-html`.

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard postcss-html
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"],
  "overrides": [
    {
      "files": ["**/*.astro"],
      "customSyntax": "postcss-html"
    }
  ]
}
```

Lint command:

```bash
npx stylelint "src/**/*.{css,astro}"
```

## SvelteKit (config snippet)

Svelte components embed `<style>` blocks. Use `postcss-html`.

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard postcss-html
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"],
  "overrides": [
    {
      "files": ["**/*.svelte"],
      "customSyntax": "postcss-html"
    }
  ],
  "ignoreFiles": [".svelte-kit/**"]
}
```

Lint command:

```bash
npx stylelint "src/**/*.{css,svelte}"
```

## Why there is no per-framework config

Every framework snippet above is the `tailwind` or `recommended` config plus a custom syntax or an ignore list. Shipping one config per framework doubled the surface for no behaviour, so 3.0 keeps five configs and documents the composition. `npx rhythmguard init` writes the Next.js ignores for you when it detects Next.js.
