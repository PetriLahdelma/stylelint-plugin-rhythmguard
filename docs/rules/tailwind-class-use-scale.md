# `rhythmguard-tailwind/tailwind-class-use-scale`

ESLint rule. Reports Tailwind arbitrary spacing values in class strings that are not on your scale, and autofixes to the utility class for the nearest scale step.

Where `eslint-plugin-tailwindcss`'s `no-arbitrary-value` bans every arbitrary value, this rule is scale-aware: `p-[12px]` passes on a 4px scale, `p-[13px]` is reported with the two nearest steps as classes, and `p-[13px]` becomes `p-3` under `--fix`.

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
Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).
```

The message names the classes to write, with the px value each one stands for. When a nearest step is not a quarter step of the spacing unit, the message falls back to the px values: `Use scale values (nearest: 12px or 16px).`

## Autofix

Writes the utility class for the nearest scale step: `p-[13px]` becomes `p-3`, `md:-m-[13px]!` becomes `md:-m-3!`, `m-[-13px]` becomes `-m-3`, and `p-[0.8125rem]` becomes `p-3`. Variants, the negative sign and important markers are kept. The class number is the snapped px value divided by `spacingUnit` (4px by default, Tailwind's `--spacing`), so a scale of 4px multiples always produces a whole number and a 2px step produces `p-1.5`.

When the snapped value is not a quarter step of the unit, the fix keeps the arbitrary form and writes the nearest step inside it (`p-[4px]`). Tailwind v4 generates any quarter step; v3 generates the quarter steps of its default scale up to `3.5` and whole numbers above, so a v3 project whose scale needs `p-4.5` should set `spacingUnit: false` to keep the arbitrary-value fix.

Template literal chunks are reported but not fixed. Negative values are reported without a fix when `allowNegative` is `false`.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `Array<number\|string>` | `[0,4,8,12,16,24,32]` | Allowed spacing values |
| `units` | `string[]` | `['px','rem','em']` | Units considered |
| `baseFontSize` | `number` | `16` | `rem` and `em` conversion base |
| `allowNegative` | `boolean` | `true` | Whether negative arbitrary values are allowed |
| `spacingUnit` | `number \| false` | `4` | Px per Tailwind spacing step (`--spacing`), used to name and write utility classes. `false` keeps the arbitrary-value fix |
| `note` | `string` | `undefined` | Appended to every finding, after the built-in text. Up to 200 characters. Point agents and reviewers at your own rules: `"See docs/spacing.md for approved exceptions."` |

## Related

- [`rhythmguard/use-scale`](./use-scale.md) is the Stylelint side for CSS declarations; use both for one scale across CSS and templates.
- [Tailwind integration guide](../TAILWIND.md).
