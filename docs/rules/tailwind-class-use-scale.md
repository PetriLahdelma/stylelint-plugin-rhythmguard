# `rhythmguard-tailwind/tailwind-class-use-scale`

ESLint rule. Reports Tailwind arbitrary spacing values in class strings that are not on your scale, at the class itself, and offers the utility classes for the two nearest scale steps as editor suggestions.

Where `eslint-plugin-tailwindcss`'s `no-arbitrary-value` bans every arbitrary value, this rule is scale-aware: `p-[12px]` passes on a 4px scale, and `p-[13px]` is reported with the two nearest steps as classes and as suggestions (`p-3`, `p-4`). Either step changes the rendered padding, so `--fix` does not pick one for you unless you set `fixOffScale: "nearest"`.

```js
// eslint.config.js
import rhythmguard from 'eslint-plugin-rhythmguard';

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
  "jsPlugins": [{ "name": "rhythmguard-tailwind", "specifier": "eslint-plugin-rhythmguard" }],
  "rules": {
    "rhythmguard-tailwind/tailwind-class-use-scale": ["error", { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

CI runs this config on Oxlint 1.93.0, on TSX, for findings, their locations, `--fix` and `--fix-suggestions` (which writes the nearest step). Oxlint's JS plugins are alpha, and in Vue, Svelte and Astro files Oxlint lints only the `<script>` blocks, so class strings in templates are not checked there; keep ESLint for those files.

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

Each finding is reported at its class token, not at the whole string, so five off-scale classes in one `className` are five squiggles in five places, and `eslint --format json` gives each one its own `column` and `endColumn`. That holds in string literals (escapes and JSX entities included), template literal chunks, and Vue and Svelte class attributes; where the source cannot be aligned with the string's value, the finding falls back to the whole string.

Every finding has a `messageId`, so tools can key on it instead of parsing the text:

| `messageId` | When |
| --- | --- |
| `offScaleUtilities` | Off-scale, both nearest steps are utility classes: `Use "p-3" (12px) or "p-4" (16px).` |
| `offScaleUtility` | Off-scale, past the top or below the bottom step, one class: `Use "p-8" (32px).` |
| `offScale` | Off-scale, a nearest step is not a utility class: `Use scale values (nearest: 12px or 16px).` |
| `noNegativeForm` | `-p-[13px]`, `gap-[-13px]`: Tailwind has no negative padding or gap |
| `negative` | A negative value with `allowNegative: false` |
| `equivalent` | With `reportEquivalents: true`, an on-scale value a utility writes exactly |

The message text is the 3.20 text. In 3.x it may only gain a suffix (the scale name, the `note`), so a pattern that matches the text before keeps matching.

## Your project's scale

The rule reads the scale your project already declares, the way the Stylelint rules do, so one scale holds in both linters and in the audit. Nothing it reads is run as code:

```js
// eslint.config.js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', {
        scale: 'auto',
        scaleSources: ['tokens/primitive.json', 'tokens/semantic.json'],
        tailwindCss: './src/app.css',
      }],
    },
  },
];
```

- `scaleSources`: token files, as for [`use-scale`](./use-scale.md): CSS and SCSS custom properties and Sass variables, DTCG, Style Dictionary, Tokens Studio and flat JSON. Paths resolve from ESLint's working directory.
- `tailwindCss`: your Tailwind v4 CSS entry point. Its `@theme` block is read as text: `--spacing` is the spacing unit (`--spacing: 2px` makes `p-7` 14px; `--spacing: initial` turns the numeric utilities off), and each `--spacing-<name>` token is the utility Tailwind generates from it (`--spacing-md: 16px` is `p-md`). Both feed the scale. The file's `@import`s are not followed.
- `scale: "auto"` resolves the scale like `use-scale` does: `scaleSources` and `tailwindCss`, then the `audit.tokenSources` of the nearest `.rhythmguardrc.json` above the linted file, then installed token packages, then `preset`, then Tailwind's default ladder on the spacing unit (with `Scale: Tailwind default spacing.` in the message). Without `scale`, `scaleSources` or `tailwindCss` alone mean `"auto"`.
- `spacingUnit` defaults to the entry's `--spacing`, and `baseFontSize` to the `font-size` the entry or a CSS token source sets on `html` or `:root` (`62.5%` is 10px).
- The `adopt` and `allow` decisions of the nearest `.rhythmguardrc.json` hold, as in Stylelint and the audit: a decided value is not a finding. `decisions: false` turns that off.

When a `--spacing-<name>` theme token holds a nearest step, the message names its utility after the 3.20 text, and suggestions and fixes write it:

```
Unexpected Tailwind arbitrary spacing value "py-[15px]". Use "py-3.5" (14px) or "py-4" (16px). In your theme: "py-md" (16px).
```

The suggestion for 16px is `py-md`, not `py-4`. When two theme tokens hold one step, both are named and neither is written. A configured file that is missing, a token file that gives no scale, or an rc whose decisions cannot be read is named on the first finding in each file, so nothing falls back in silence.

`tailwindConfigPath` reads a Tailwind v3 config's `theme.spacing` for `scale: "auto"`, as in `use-scale`. It is the one option that runs a file: the rule loads that config with `require()`. Only your ESLint config can name it; a `.rhythmguardrc.json` in the repository never makes the rule load code ([SECURITY.md](../../SECURITY.md)).

Every file is read once per process and read again only when its modification time changes, so an editor that lints on each keystroke does not reparse your tokens.

## Suggestions and autofix

An off-scale value gets two editor suggestions, `Use "p-3" (12px).` and `Use "p-4" (16px).`, the nearest step first, and no autofix: either step changes the rendered spacing, and a fix that moves layout under `--fix` is how a lint run becomes a reverted pull request. In VS Code the suggestions are in the quick fix menu; `oxlint --fix-suggestions` applies the first one, the nearest step. A value past the top step gets one suggestion, the top step. Findings for negative values that cannot be written (`-p-[13px]`) or are disabled get none.

Autofix rewrites a class only to one that renders the same value. With `reportEquivalents: true`, an on-scale arbitrary value that a utility class writes exactly is reported and fixed: `p-[12px]` and `p-[0.75rem]` become `p-3` on a 4px spacing unit, `m-[-8px]` becomes `-m-2`. `em` values are never equivalent to a utility, since utilities are root-relative. It is off by default in 3.x, so default findings do not grow.

`fixOffScale: "nearest"` restores the 3.20 behaviour: `--fix` writes the nearest step. The rest of this section describes the class it writes, which is also the class each suggestion writes.

Writes the utility class for the nearest scale step: `p-[13px]` becomes `p-3`, `md:-m-[13px]!` becomes `md:-m-3!`, `m-[-13px]` becomes `-m-3`, `-m-[-13px]` (two signs, a positive margin in Tailwind) becomes `m-3`, and `p-[0.8125rem]` becomes `p-3`. Variants, the negative sign and important markers are kept. The class number is the snapped px value divided by `spacingUnit` (Tailwind's `--spacing`, `0.25rem`: 4px by default, `baseFontSize / 4` when `baseFontSize` is set), so a scale of 4px multiples at a 16px root always produces a whole number and a 2px step produces `p-1.5`. At a 10px root a step is 2.5px, so `p-[1.3rem]` is fixed to `p-[1.2rem]` rather than `p-3`, which would be 7.5px there.

`em` values keep the arbitrary form and their unit: `p-[1.1em]` becomes `p-[1em]`. Utility classes are root-relative, and an `em` value follows the element's own font size, so no class is the same length.

When the snapped value is not a quarter step of the unit, the fix keeps the arbitrary form and writes the nearest step inside it (`p-[4px]`). Tailwind v4 generates any quarter step; v3 generates the quarter steps of its default scale up to `3.5` and whole numbers above, so a v3 project whose scale needs `p-4.5` should set `spacingUnit: false` to keep the arbitrary-value fix.

Tailwind has no negative padding, scroll padding or gap: it generates no `-p-3` or `-gap-3`, and `p-[-13px]` writes a declaration the browser drops. An off-scale `-p-[13px]`, `p-[-13px]`, `-gap-[13px]` or `gap-[-13px]` is reported with `Padding and gap cannot be negative, so this class has no effect.` and no fix; the rule never suggests `-p-3` or `-gap-3`. Margin, inset, `top`/`right`/`bottom`/`left`, translate, `scroll-m*` and `space-*` keep their negative forms.

A template literal chunk is fixed and gets suggestions when its text has no escape sequence, so its raw source is its value: `` cn(`p-[13px] ${x}`) `` becomes `` cn(`p-3 ${x}`) ``. A chunk with an escape (`\n`, `\u00e9`) is reported at the token but not fixed. Before 3.21 no chunk was fixed. Negative values, written either way (`m-[-16px]` or `-m-[16px]`), are reported without a fix when `allowNegative` is `false`; `-m-[-16px]` is positive and is checked like `m-[16px]`.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `Array<number\|string> \| "auto"` | Tailwind's default spacing ladder | Allowed spacing values, or `"auto"` to read them from the project (see [Your project's scale](#your-projects-scale)). Without it, and without `scaleSources`, `tailwindCss` or `preset`, the steps of Tailwind's default theme as multiples of `spacingUnit` (`0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, ... 384` on a 16px root, the `tailwind` preset), and each message ends with `Scale: Tailwind default spacing.` Before 3.20 the default was `[0,4,8,12,16,24,32]`. Set `scale` to your project's scale when it is not Tailwind's |
| `units` | `string[]` | `['px','rem','em']` | Units considered |
| `baseFontSize` | `number` | the root `font-size` in `tailwindCss` or a CSS token source, else `16` | `rem` and `em` conversion base |
| `scaleSources` | `Array<string \| object>` | `[]` | Token files that hold the scale, as for `use-scale`. With no `scale`, they mean `"auto"` |
| `tailwindCss` | `string` | none | The Tailwind v4 CSS entry point. `--spacing` sets the spacing unit; `--spacing-<name>` tokens are named in messages and written by fixes; both feed the scale |
| `preset` | `string` | none | A built-in scale ([presets](../SCALE_PRESETS.md)): the scale when `scale` is not set, the fallback of `"auto"` |
| `decisions` | `boolean` | `true` | Apply the `adopt` and `allow` decisions of the nearest `.rhythmguardrc.json` |
| `tailwindConfigPath` | `string` | none | A Tailwind v3 config for `scale: "auto"`. Loaded with `require()`, so it runs that file |
| `classFunctions` | `string[]` | `[]` | Function and tagged-template names whose arguments are class strings, added to the built-in list (`cn`, `clsx`, `classnames`, `cx`, `cva`, `tv`, `twMerge`, `twJoin`, `tw`). It extends the list; it cannot remove a built-in name. See [What it checks](#what-it-checks) |
| `classContexts` | `string[]` | `[]` | JSX attribute and object property names whose values are class strings, added to `class`, `className` and `*ClassName`. A leading `*` matches by suffix (`"*Classes"`). Applies to Vue and Svelte attribute names too. Every other attribute is never checked |
| `allowHairlines` | `boolean` | `true` | Skips non-zero lengths of one CSS pixel or less (`translate-y-[0.5px]`, `-mt-[1px]`). See [Hairlines](#hairlines) |
| `allowNegative` | `boolean` | `true` | Whether negative arbitrary values are allowed |
| `spacingUnit` | `number \| false` | `--spacing` in `tailwindCss`, else `baseFontSize / 4` (`4`) | Px per Tailwind spacing step (`--spacing`, `0.25rem`), used to name and write utility classes. `false` keeps the arbitrary-value fix |
| `fixOffScale` | `"nearest" \| false` | `false` | `"nearest"` autofixes an off-scale value to the nearest step, as 3.20 did. By default an off-scale value gets suggestions only. See [Suggestions and autofix](#suggestions-and-autofix) |
| `reportEquivalents` | `boolean` | `false` | Also report an on-scale arbitrary value that a utility class writes exactly (`p-[12px]` is `p-3`), with an autofix to the class |
| `note` | `string` | `undefined` | Appended to every finding, after the built-in text. Up to 200 characters. Point agents and reviewers at your own rules: `"See docs/spacing.md for approved exceptions."` |

## Related

- [`rhythmguard/use-scale`](./use-scale.md) is the Stylelint side for CSS declarations; use both for one scale across CSS and templates.
- [Tailwind integration guide](../TAILWIND.md).
