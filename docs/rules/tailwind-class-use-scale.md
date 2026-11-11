# `rhythmguard-tailwind/tailwind-class-use-scale`

ESLint rule. Reports Tailwind arbitrary spacing values in class strings that are not on your scale, and autofixes to the utility class for the nearest scale step.

Where `eslint-plugin-tailwindcss`'s `no-arbitrary-value` bans every arbitrary value, this rule is scale-aware: `p-[12px]` passes on a 4px scale, `p-[13px]` is reported with the two nearest steps as classes, and `p-[13px]` becomes `p-3` under `--fix`.

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

`files` and `ecmaFeatures.jsx` are what make ESLint lint `.jsx`. TypeScript, Vue, Svelte and Astro files need their parser: see [Other file types](../../packages/eslint-plugin-rhythmguard/README.md#other-file-types).

Under Oxlint, load the rule as a JS plugin:

```json
// .oxlintrc.json
{
  "jsPlugins": [{ "name": "rhythmguard-tailwind", "specifier": "stylelint-plugin-rhythmguard/eslint" }],
  "rules": {
    "rhythmguard-tailwind/tailwind-class-use-scale": ["error", { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

CI runs this config on Oxlint 1.88.0, on TSX, for both findings and `--fix`. Oxlint's JS plugins are alpha, and Oxlint does not lint Vue or Svelte templates, so keep ESLint for those files.

A `recommended` config is exported too: `rhythmguard.configs.recommended` enables this rule at `warn` and the motion rule `off`. It registers the plugin as `rhythmguard-tailwind`, so `export default [rhythmguard.configs.recommended]` works on its own; spreading `rhythmguard.configs.recommended.rules` into a block like the one above works as well.

## What it checks

Class strings: string literals and template chunks in a class context, and other strings only when they look like a class list. Type positions and non-class attributes are never checked, so `--fix` cannot rewrite a type union, an enum member or an accessible name.

Class contexts, always checked:

- JSX attributes `className`, `class` and any name ending in `ClassName` (`contentClassName`): `className="p-[13px]"`, `className={active ? "p-[13px]" : ""}`, `` className={`p-[13px] ${x}`} ``
- Object properties with those names: `{ className: "p-[13px]" }`
- Arguments of `cn`, `clsx`, `classnames`, `cx`, `cva`, `tv`, `twMerge` and `twJoin`, including nested arrays, object keys and values, and both branches of `?:`, `&&`, `||` and `??`: `cn("p-[13px]", condition && "m-[7px]")`, `clsx({ "p-[13px]": on })`, `cva("base", { variants: { size: { sm: "p-[5px]" } } })`, `tv({ base: "p-[13px]", slots: { body: "m-[7px]" } })`. A method call matches by its name too (`utils.cn(...)`). A call to any other function takes the context it sits in: `className={mergeClasses("p-[13px]")}` is checked, `title={t("p-[13px]")}` is not
- `tw` tagged templates: `` tw`p-[13px]` ``, `` tw.div`p-[13px]` ``
- `<div class="p-[13px]">` in a Vue `<template>` (vue-eslint-parser) or a Svelte component (svelte-eslint-parser), and the strings in bound classes (`:class="..."`, `class={...}`)

Never checked:

- Type positions: string literal types, template literal types, enum members, interface and type alias members (`type Size = "p-[13px]"`, `enum Spacing { Tight = "p-[13px]" }`)
- Any other JSX, Vue or Svelte attribute: `aria-*`, `title`, `id`, `data-*`, `alt`, `placeholder`, component props such as `<Box padding="p-[13px]">`

Any other string is checked only when it holds two or more utility-shaped tokens: `const base = "flex p-[13px]"` is checked, `Object.freeze({ Tight: "p-[13px]" })` and `"Error in p-[13px] string"` are not. A token is utility-shaped when, after its variant prefix (`md:`), important marker and leading `-` are removed, it is an arbitrary value (`p-[13px]`, `bg-[#fff]`), a numeric step or fraction (`p-4`, `w-1/2`, `bg-red-500`), a size keyword step (`text-sm`, `w-full`, `m-auto`), or one of a short list of keyword utilities (`flex`, `hidden`, `items-center`). Capitalised and plain words never are. The test is deliberately strict: a lone class in a plain variable (`const pad = "p-[13px]"`) is not checked; move it into a `cn(...)` call or a `className`, or add your helper to `classFunctions`.

The gate needs no type information or scope analysis, so it runs the same under ESLint and Oxlint. `rhythmguard audit` does not apply it: its template scan has no parser and still reads every string literal in a template file.

Variant prefixes are handled (`md:p-[13px]`, `has-[>button]:ml-[-0.3rem]`). Spacing utilities covered: padding, margin, gap, inset, space, translate and their axis and side variants. Arbitrary values in `rem` and `em` are converted through `baseFontSize`.

Hairlines are not reported: see [Hairlines](#hairlines).

## Hairlines

A hairline is a non-zero length that resolves to one CSS pixel or less: `1px`, `-1px`, `0.5px`, `0.0625rem`. The definition is the one [`use-scale`](./use-scale.md#hairlines) uses, and the rule exempts them by default for the same reason: these values compensate for something else, they are not spacing decisions.

- `-mt-[1px]` or `m-[-1px]` pulls a border over the neighbouring border so two 1px lines do not stack.
- `top-[1px]` or `inset-[1px]` nudges a focus ring or an icon into optical alignment.
- `active:translate-y-[0.5px]` is a pressed-state nudge.

Reporting them as "use `translate-y-0` or `translate-y-1`" is technically true and practically wrong, and the same `0.5px` is already quiet in CSS under `use-scale`. Set `allowHairlines: false` to report them; a team that renders hairlines through a token or a dedicated utility may want exactly that.

The exemption is by resolved size, not by literal: `p-[0.0625rem]` at a 16px base is a hairline, `gap-[1.5px]` is not, and `0` is never reported anyway. `rem` and `em` resolve through `baseFontSize`, so `p-[0.1rem]` is a hairline at a 10px root. A hairline is exempt before `allowNegative` is checked, as in `use-scale`: `-mt-[1px]` is not reported even when negative values are disabled. `rhythmguard audit` applies the same default to class strings.

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

Writes the utility class for the nearest scale step: `p-[13px]` becomes `p-3`, `md:-m-[13px]!` becomes `md:-m-3!`, `m-[-13px]` becomes `-m-3`, `-m-[-13px]` (two signs, a positive margin in Tailwind) becomes `m-3`, and `p-[0.8125rem]` becomes `p-3`. Variants, the negative sign and important markers are kept. The class number is the snapped px value divided by `spacingUnit` (Tailwind's `--spacing`, `0.25rem`: 4px by default, `baseFontSize / 4` when `baseFontSize` is set), so a scale of 4px multiples at a 16px root always produces a whole number and a 2px step produces `p-1.5`. At a 10px root a step is 2.5px, so `p-[1.3rem]` is fixed to `p-[1.2rem]` rather than `p-3`, which would be 7.5px there.

`em` values keep the arbitrary form and their unit: `p-[1.1em]` becomes `p-[1em]`. Utility classes are root-relative, and an `em` value follows the element's own font size, so no class is the same length.

When the snapped value is not a quarter step of the unit, the fix keeps the arbitrary form and writes the nearest step inside it (`p-[4px]`). Tailwind v4 generates any quarter step; v3 generates the quarter steps of its default scale up to `3.5` and whole numbers above, so a v3 project whose scale needs `p-4.5` should set `spacingUnit: false` to keep the arbitrary-value fix.

Tailwind has no negative padding, scroll padding or gap: it generates no `-p-3` or `-gap-3`, and `p-[-13px]` writes a declaration the browser drops. An off-scale `-p-[13px]`, `p-[-13px]`, `-gap-[13px]` or `gap-[-13px]` is reported with `Padding and gap cannot be negative, so this class has no effect.` and no fix; the rule never suggests `-p-3` or `-gap-3`. Margin, inset, `top`/`right`/`bottom`/`left`, translate, `scroll-m*` and `space-*` keep their negative forms.

Template literal chunks are reported but not fixed. Negative values, written either way (`m-[-16px]` or `-m-[16px]`), are reported without a fix when `allowNegative` is `false`; `-m-[-16px]` is positive and is checked like `m-[16px]`.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `Array<number\|string>` | Tailwind's default spacing ladder | Allowed spacing values. Without it, the steps of Tailwind's default theme as multiples of `spacingUnit` (`0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, ... 384` on a 16px root, the `tailwind` preset), and each message ends with `Scale: Tailwind default spacing.` Before 3.20 the default was `[0,4,8,12,16,24,32]`. Set `scale` to your project's scale when it is not Tailwind's |
| `units` | `string[]` | `['px','rem','em']` | Units considered |
| `baseFontSize` | `number` | `16` | `rem` and `em` conversion base |
| `classFunctions` | `string[]` | `[]` | Function and tagged-template names whose arguments are class strings, added to the built-in list (`cn`, `clsx`, `classnames`, `cx`, `cva`, `tv`, `twMerge`, `twJoin`, `tw`). It extends the list; it cannot remove a built-in name. See [What it checks](#what-it-checks) |
| `classContexts` | `string[]` | `[]` | JSX attribute and object property names whose values are class strings, added to `class`, `className` and `*ClassName`. A leading `*` matches by suffix (`"*Classes"`). Applies to Vue and Svelte attribute names too. Every other attribute is never checked |
| `allowHairlines` | `boolean` | `true` | Skips non-zero lengths of one CSS pixel or less (`translate-y-[0.5px]`, `-mt-[1px]`). See [Hairlines](#hairlines) |
| `allowNegative` | `boolean` | `true` | Whether negative arbitrary values are allowed |
| `spacingUnit` | `number \| false` | `baseFontSize / 4` (`4`) | Px per Tailwind spacing step (`--spacing`, `0.25rem`), used to name and write utility classes. `false` keeps the arbitrary-value fix |
| `note` | `string` | `undefined` | Appended to every finding, after the built-in text. Up to 200 characters. Point agents and reviewers at your own rules: `"See docs/spacing.md for approved exceptions."` |

## Related

- [`rhythmguard/use-scale`](./use-scale.md) is the Stylelint side for CSS declarations; use both for one scale across CSS and templates.
- [Tailwind integration guide](../TAILWIND.md).
