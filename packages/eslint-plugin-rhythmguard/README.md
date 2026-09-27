<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.png?v=13" width="100%" alt="Rhythmguard: stable local evidence for design system drift" />
</p>

# eslint-plugin-rhythmguard

Nobody chose 13px. This plugin catches off-scale Tailwind arbitrary spacing in class strings, tells you the utility classes for the nearest steps on your scale, and writes the right class when you run `--fix`.

[![npm version](https://img.shields.io/npm/v/eslint-plugin-rhythmguard?label=npm&color=1f6feb)](https://www.npmjs.com/package/eslint-plugin-rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/eslint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/eslint-plugin-rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/LICENSE)

```tsx
<div className="p-[13px] md:gap-[18px]" />
```

```
1:16  warning  Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px)
1:16  warning  Unexpected Tailwind arbitrary spacing value "md:gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px)
```

`--fix` writes `p-3` and `md:gap-4`. Variants, negative signs and important markers are kept: `md:-m-[13px]!` becomes `md:-m-3!`.

## Why this and not a ban

Most Tailwind lint rules either forbid arbitrary values outright or rewrite them to an equivalent class. Tailwind's own canonical classes turn `p-[13px]` into `p-3.25` and call it on the scale. This rule asks a different question: is the value one of the steps your design system allows? `p-[12px]` passes on a 4px scale, `p-[13px]` does not, and the finding names the two classes you probably meant.

## Install

```bash
npm install --save-dev eslint eslint-plugin-rhythmguard
```

## Configure

```js
// eslint.config.js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx,vue,svelte,astro}'],
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

Or start from the `recommended` config, which turns the spacing rule on as a warning with the default scale:

```js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  { plugins: { 'rhythmguard-tailwind': rhythmguard }, rules: rhythmguard.configs.recommended.rules },
];
```

Set `scale` to your design system's spacing steps in px. The rule does not read your Tailwind theme; the Stylelint plugin does that for stylesheets (see below).

### Oxlint

The rules run unchanged through Oxlint's JS plugin support (checked with Oxlint 1.85):

```json
// .oxlintrc.json
{
  "jsPlugins": [{ "name": "rhythmguard-tailwind", "specifier": "eslint-plugin-rhythmguard" }],
  "rules": {
    "rhythmguard-tailwind/tailwind-class-use-scale": ["error", { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

## Rules

| Rule | What it reports | Fix |
| --- | --- | --- |
| [`tailwind-class-use-scale`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-scale.md) | Off-scale arbitrary spacing values (`p-[13px]`, `gap-[18px]`, `-m-[7px]`) in class strings | The utility class for the nearest step |
| [`tailwind-class-use-motion-scale`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-motion-scale.md) | Off-scale `duration-[...]` and `delay-[...]`, raw `ease-[...]`. Opt-in | Nearest duration |

### What gets checked

Every string literal and template chunk in the file, so there is nothing to configure per helper:

- `className="p-[13px]"`
- `cn("p-[13px]", condition && "m-[7px]")`, `clsx(...)`, `twMerge(...)`
- `cva("base", { variants: { size: { sm: "p-[5px]" } } })`

Padding, margin, gap, inset, space and translate utilities, with their axis and side variants and any variant prefix (`md:`, `hover:`, `has-[>button]:`). `rem` and `em` values are converted through `baseFontSize`.

### Options for `tailwind-class-use-scale`

| Option | Default | What it does |
| --- | --- | --- |
| `scale` | `[0, 4, 8, 12, 16, 24, 32]` | Allowed spacing values in px |
| `units` | `['px', 'rem', 'em']` | Units the rule checks |
| `baseFontSize` | `16` | Base for converting `rem` and `em` |
| `allowNegative` | `true` | Whether negative arbitrary values are allowed |
| `spacingUnit` | `4` | Px per Tailwind spacing step, used to name and write classes. `false` keeps the fix in arbitrary form (`p-[12px]`) |
| `note` | none | A sentence added to every finding, such as `"See docs/spacing.md for approved exceptions."` Up to 200 characters |

Full reference, including how the fix chooses between `p-3` and `p-[12px]`: [rule docs](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-scale.md).

## The rest of Rhythmguard

Class strings are one place spacing drifts. [stylelint-plugin-rhythmguard](https://www.npmjs.com/package/stylelint-plugin-rhythmguard) covers CSS, SCSS and CSS Modules, reads your scale from your own tokens (Tailwind `@theme`, custom properties, Sass maps, DTCG files), and ships an audit that measures drift across a codebase and fails CI only on new drift. Try it with no install:

```bash
npx rhythmguard
```

This package re-exports `stylelint-plugin-rhythmguard/eslint`, so the rules, options and messages are one implementation. If you already use the Stylelint plugin, that import works too.

## Compatibility

ESLint 8 or newer with flat config; tested on ESLint 9 and checked on ESLint 10. Node 20.19 or newer. TypeScript declarations included.

## License

MIT. Issues and contributions: [github.com/PetriLahdelma/stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard).
