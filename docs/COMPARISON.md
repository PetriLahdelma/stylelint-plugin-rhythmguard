# The tool you already have, and what Rhythmguard adds

Most teams that look at Rhythmguard already run something that touches spacing: Stylelint's core rules, a strict-value plugin, a Tailwind lint plugin or a token linter. This page puts each next to Rhythmguard on the same two inputs, `padding: 13px` in a stylesheet and `p-[13px]` in a class string, so you can decide whether to replace it, run both, or skip Rhythmguard.

Every fact here comes from a run in this repository (the [Tailwind comparison](../benchmarks/tailwind-compare/RESULTS.md), the tests named below) or from the tool's own documentation, linked. Anything we could not check is left out.

What Rhythmguard adds to any row below:

- It reads the scale from your token file: DTCG, Style Dictionary, Tokens Studio, Tailwind `@theme`, Sass, CSS custom properties, or one of 16 installed token packages. Spacing written as multiples of a unit with no fixed length is checked as a [unit ladder](./rules/use-scale.md#unit-ladders).
- It holds stylesheets and class strings to that one scale.
- A finding names the two nearest steps, and in the audit the token that holds the value.
- The audit records a baseline and fails CI only on new drift.

## At a glance

| Tool | What it checks | `padding: 13px` | `p-[13px]` | Where its scale comes from | With Rhythmguard |
| --- | --- | --- | --- | --- | --- |
| Stylelint 18 `value-type-custom-property-required-list` | A length must be a custom property | Reported, as are `12px` and `1px`; no step named; `--fix` leaves it | not read | It has none | Run both: [the pairing](../README.md#stylelint-18s-custom-property-rule) |
| Stylelint `declaration-property-value-allowed-list` | A value matches a pattern you list per property | Reported when your pattern leaves it out; no step named; no fix | not read | A regular expression you type | Replace it with `use-scale`, or keep [the core-only recipe](#the-stylelint-18-recipe-core-rules-only) |
| [stylelint-declaration-strict-value](https://github.com/AndyOGo/stylelint-declaration-strict-value) | Listed properties use a variable, function, keyword or listed value | Reported when `padding` is listed | not read | It has none | Run both: it asks for a variable, Rhythmguard says which step |
| [stylelint-scales](https://github.com/signal-noise/stylelint-scales) | One rule per property family (`scales/space`, `scales/font-sizes`, ...) against a numeric scale | Its README says every rule autofixes | not read | An array per rule, with units | Pick one of the two for spacing |
| [eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss) 4.10.0 | Canonical class spelling, among other class rules | not read | no finding | Your Tailwind entry point | Run both |
| [eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss) 4.4.0 | Canonical class names and unnecessary arbitrary values, among other class rules | not read | no finding | Your Tailwind CSS config | Run both |
| [@shadcn/lint](https://github.com/shadcn-ui/lint) 0.2.5 | Component contracts and arbitrary values in class strings | not read; its README sends `<style>` blocks to a CSS linter | Use `p-3.25` "(same value, on the scale)" | The theme, through `components.json` or `themeImports` | Run both, each value reported once: [Tailwind guide](./TAILWIND.md#with-shadcnlint-and-tailwind-canonical-classes) |
| [oxlint-tailwindcss](https://github.com/sergioazoc/oxlint-tailwindcss) 1.17.1 | Tailwind v4 class rules for Oxlint | not read | Closest in your theme: `p-3` (12px) or `p-3.5` (14px) | Your Tailwind CSS entry point (`@theme`) | Run both |
| Tailwind CLI 4.3.4 `canonicalize` | Rewrites a class to its canonical form | not read | unchanged; `p-[0.8125rem]` becomes `p-3.25` | Your Tailwind CSS | Run both; it formats, Rhythmguard judges the step |
| [Terrazzo lint](https://terrazzo.app/docs/linting/) | The token file itself: formats, naming, duplicates, contrast | not read | not read | It lints the token file | Run both: Terrazzo checks the tokens, Rhythmguard checks where they are used |
| Rhythmguard | Spacing values against your scale | Use 12px or 16px; `--fix` writes 12px | Use `p-3` (12px) or `p-4` (16px) | Your token file, or the steps you set | |

The Tailwind columns are measured by `node scripts/bench/tailwind-compare.mjs` on the default theme, with Rhythmguard on the scale `[0, 4, 8, 12, 16, 24, 32]`. One gap is shared by every Tailwind tool in that run, Rhythmguard included: a bare v4 step such as `p-3.25` (13px) is reported by none of them.

## Stylelint's core rules

### Stylelint 18's `value-type-custom-property-required-list`

The core rule says a length must be a custom property. It reports `16px` and a `1px` hairline the same way as `13px`, names no step, and `--fix` leaves the value alone. `use-scale` says which value is off your scale and which two steps are nearest, and `--fix` writes the nearest step; `prefer-token` names the token that holds the value. To move every length to a token over time, run both, as in the [README's pairing](../README.md#stylelint-18s-custom-property-rule). `test/contracts/stylelint-18-pairing.test.js` runs that pairing on Stylelint 18 and checks each sentence above.

### The `stylelint-18` recipe: core rules only

A team that will not add a plugin can approximate a scale with two core rules: `declaration-property-value-allowed-list` with the steps as a pattern, and the custom-property rule as a warning. This is a documented recipe, not a shipped config: it uses no Rhythmguard rule, so there is nothing for the package to export.

```json
{
  "rules": {
    "declaration-property-value-allowed-list": [
      {
        "/^(padding|margin|gap|row-gap|column-gap|inset)/": [
          "/^(?:(?:-?(?:0|4px|8px|12px|16px|24px|32px|40px|48px|64px)|auto|var\\(--space-[\\w-]+\\))(?:\\s+|$))+$/"
        ]
      }
    ],
    "value-type-custom-property-required-list": [["length"], { "severity": "warning" }]
  }
}
```

What it does on Stylelint 18.0.0, checked by `test/contracts/stylelint-18-pairing.test.js`:

- `padding: 13px` is reported as `Disallowed value "13px" for property "padding"`, with no step named and no fix.
- `padding: 8px 16px`, `margin: -8px` and `margin: var(--space-3)` pass.
- The pattern compares text, so `padding: 0.75rem`, which is 12px, is reported unless you list `0.75rem` too, and so is a `1px` hairline. `use-scale` converts `rem` and `em` and allows hairlines by default.
- The steps live in the pattern. When the scale changes in your token file, edit the pattern by hand; `use-scale` with `scale: "auto"` reads the file.

### stylelint-declaration-strict-value

Its README describes it as a rule to "specify properties for which a variable, function, keyword or value must be used". It has no notion of a scale or a nearest step, and it fixes only through an `autoFixFunc` you write. It covers properties Rhythmguard does not, such as colors and `z-index`. Keep it for those, and for spacing add `use-scale`, which names the step a raw value should be.

## Plugins with a scale

### stylelint-scales

One rule per property family, each with its own scale array and units, and every rule autofixes, according to its README. Its README does not say whether it reads token files or custom properties. Rhythmguard's `use-scale` covers spacing, radius, size and typography groups with one shared scale or one per group (`scales`), and can infer it from your tokens. Running both on spacing reports the same value twice; pick one for spacing.

## Tailwind class strings

### eslint-plugin-better-tailwindcss and eslint-plugin-tailwindcss

Both rewrite a class to its canonical spelling: `p-[0.8125rem]` to `p-3.25`. eslint-plugin-tailwindcss also reports `p-[12px]` as `p-3`. Neither reports `p-[13px]` in px. They check spelling and Rhythmguard checks the step, so they run side by side without overlap on spacing.

### @shadcn/lint

Its `no-arbitrary-values` reports `p-[13px]` and suggests `p-3.25`, "same value, on the scale": the equivalent class, which is still 13px. It owns component contracts ("Button owns its padding") and arbitrary widths, colors, type sizes and radii; it reads JSX, TSX, Vue and Svelte class sites as an ESLint or Oxlint plugin, and no stylesheets. Its README describes no baseline. Rhythmguard owns whether a spacing value is a step of your scale, in class strings and stylesheets, with a baseline. Both report an arbitrary spacing class, so the [Tailwind guide](./TAILWIND.md#with-shadcnlint-and-tailwind-canonical-classes) gives one ESLint config where @shadcn/lint's `allow` list hands the spacing utilities to Rhythmguard; the comparison script runs that config and fails if any class is reported twice.

### oxlint-tailwindcss

An Oxlint plugin with Tailwind v4 rules that load your theme from a CSS entry point. Its `no-arbitrary-value` names the closest steps of that theme: for `p-[13px]`, `p-3` (12px) or `p-3.5` (14px). With `prefer-scale-token` and `no-unnecessary-arbitrary-value` on as well, it reports `p-[12px]` as the same value as `p-3`. Its steps are the steps of your Tailwind theme; Rhythmguard checks against the steps you allow, and for stylesheets reads them from your token file. Both run under Oxlint. Oxlint's JS plugins are alpha, and in Vue, Svelte and Astro files Oxlint lints only the `<script>` blocks.

### Tailwind's `canonicalize`

The Tailwind CLI's `canonicalize` command rewrites a class to its canonical form. In our run it left `p-[13px]` alone and rewrote `p-[0.8125rem]` to `p-3.25`. Once a value is a bare step, no linter in the comparison reports it, so let Rhythmguard see the bracketed value first.

## Token-file linters

### Terrazzo

Terrazzo's lint rules check the token file itself: value formats, naming, duplicate values, required modes, contrast and minimum font sizes. No rule reads the CSS or class strings that use the tokens. Run both: Terrazzo keeps the file valid, Rhythmguard reads it and checks every use.

## Pairs with

Two Stylelint plugins solve problems next to spacing and run alongside Rhythmguard without overlap: [stylelint-plugin-defensive-css](https://github.com/yuschick/stylelint-plugin-defensive-css) (resilience and accessibility guardrails) and [stylelint-plugin-logical-css](https://github.com/yuschick/stylelint-plugin-logical-css) (logical properties for writing-mode-safe CSS; it still peers on Stylelint 17 or older).

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/recommended"
  ]
}
```

## Tailwind class-string companion (ESLint)

```js
// eslint.config.js
import rhythmguard from 'eslint-plugin-rhythmguard';

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: {
      'rhythmguard-tailwind': rhythmguard,
    },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```
