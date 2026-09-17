# eslint-plugin-rhythmguard

ESLint rules that keep Tailwind arbitrary spacing and motion values in class strings on your design scale. `p-[13px]` on a 4px scale is reported as:

```
Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).
```

and `--fix` writes `p-3`. Variants, negative signs and important markers are kept: `md:-m-[13px]!` becomes `md:-m-3!`.

This package is the ESLint companion of [stylelint-plugin-rhythmguard](https://www.npmjs.com/package/stylelint-plugin-rhythmguard) under its own name. It re-exports `stylelint-plugin-rhythmguard/eslint`; the rules, options and messages are one implementation. Use whichever name you prefer. If you already depend on the Stylelint plugin, `stylelint-plugin-rhythmguard/eslint` gives you the same rules with no extra package.

## Install

```bash
npm install --save-dev eslint eslint-plugin-rhythmguard
```

## Use

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

Or take the `recommended` config, which enables the spacing rule at `warn`:

```js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  { plugins: { 'rhythmguard-tailwind': rhythmguard }, rules: rhythmguard.configs.recommended.rules },
];
```

## Rules

| Rule | What it reports | Fix |
| --- | --- | --- |
| [`tailwind-class-use-scale`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-scale.md) | Off-scale arbitrary spacing values (`p-[13px]`, `gap-[18px]`, `-m-[7px]`) in class strings | The utility class for the nearest step |
| [`tailwind-class-use-motion-scale`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/tailwind-class-use-motion-scale.md) | Off-scale `duration-[...]` and `delay-[...]`, raw `ease-[...]`. Opt-in | Nearest duration |

Both rules check every string literal and template chunk, so `className`, `cn()`, `clsx()`, `twMerge()` and `cva()` are all covered without configuration. Both accept `note`, a sentence appended to every finding that points at your own rules file.

## The rest of Rhythmguard

Class strings are one place spacing drifts. The Stylelint plugin covers CSS, SCSS and CSS Modules, infers your scale from your tokens, and ships `npx rhythmguard audit` to measure drift across a codebase and gate new drift in CI. Start at the [main README](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard#readme).

## License

MIT.
