# `rhythmguard-tailwind/tailwind-class-use-scale`

ESLint rule. Reports Tailwind arbitrary spacing values in class strings that are not on your scale, and autofixes to the nearest on-scale value.

Where `eslint-plugin-tailwindcss`'s `no-arbitrary-value` bans every arbitrary value, this rule is scale-aware: `p-[12px]` passes on a 4px scale, `p-[13px]` is reported with the two nearest steps, and `p-[13px]` becomes `p-[12px]` under `--fix`.

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

A `recommended` config is exported too: `rhythmguard.configs.recommended` enables this rule at `warn` and the motion rule `off`.

## What it checks

Every string literal and template chunk in the file, so it needs no callee configuration. These all get checked:

- `className="p-[13px]"`
- `cn("p-[13px]", condition && "m-[7px]")`
- `clsx("p-[13px]", "gap-[18px]")`
- `twMerge("p-[13px]", other)`
- `cva("base", { variants: { size: { sm: "p-[5px]" } } })`

Variant prefixes are handled (`md:p-[13px]`, `has-[>button]:ml-[-0.3rem]`). Spacing utilities covered: padding, margin, gap, inset, space, translate and their axis and side variants. Arbitrary values in `rem` and `em` are converted through `baseFontSize`.

## Examples

```tsx
{/* ❌ Off-scale arbitrary values */}
<div className={cn('p-[13px]', 'md:gap-[18px]')} />

{/* ✅ On-scale, or tokenized */}
<div className={cn('p-[12px]', 'md:gap-[16px]')} />
<div className="p-3 md:gap-4" />
```

Message for the failing case:

```
Unexpected Tailwind arbitrary spacing value "p-[13px]". Use scale values (nearest: 12px or 16px).
```

## Autofix

Replaces the arbitrary value with the nearest scale step inside the same string literal. Template literal chunks are reported but not fixed. Negative values are reported without a fix when `allowNegative` is `false`.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `Array<number\|string>` | `[0,4,8,12,16,24,32,40,48,64]` | Allowed spacing values |
| `units` | `string[]` | `['px','rem','em']` | Units considered |
| `baseFontSize` | `number` | `16` | `rem` and `em` conversion base |
| `allowNegative` | `boolean` | `true` | Whether negative arbitrary values are allowed |

## Related

- [`rhythmguard/use-scale`](./use-scale.md) is the Stylelint side for CSS declarations; use both for one scale across CSS and templates.
- [Tailwind integration guide](../TAILWIND.md).
