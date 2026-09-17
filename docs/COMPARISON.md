# Defensive CSS vs Logical CSS vs Rhythmguard

This guide helps teams choose the right Stylelint plugin for each problem, then roll them out in a practical order.

## Quick decision matrix

| Tool | Primary problem solved | Best fit |
| --- | --- | --- |
| `stylelint-plugin-defensive-css` | Resilience and accessibility guardrails | UI hardening, interaction safety, reduced-motion, focus behavior |
| `stylelint-plugin-logical-css` | Direction-agnostic and writing-mode-safe CSS | Internationalization, RTL/LTR parity, logical properties and keywords |
| `stylelint-plugin-rhythmguard` | Off-scale spacing and missing tokens | Spacing (and optionally radius, size, typography) kept on one scale, with deterministic nearest-value autofix |
| `stylelint-scales` | Property-specific numeric scale enforcement | Teams that want granular scale rules per property category |
| `@shadcn/lint` | Component contracts in Tailwind class strings | Tailwind v4 projects, with or without shadcn/ui, where the rule is "Button owns its padding" and agents write the JSX |

## When to use each

### Use `stylelint-plugin-defensive-css` when:

- You want to prevent fragile UX patterns (`:hover` misuse, unsafe `will-change`, missing reduced-motion handling).
- Accessibility and robust interaction behavior are immediate priorities.

### Use `stylelint-plugin-logical-css` when:

- You are migrating to logical properties (`margin-inline`, `padding-block`, etc.).
- You support multiple writing directions and want CSS that adapts without rewrites.

### Use `stylelint-plugin-rhythmguard` when:

- Your spacing scale is being bypassed by arbitrary values.
- You need token migration support and deterministic autofix to nearest scale values.
- You want one plugin that can cover spacing, transform translation offsets, and optional radius/typography/size groups.

### Use `stylelint-scales` when:

- You want a broad rule-pack where each property family has its own numeric rule.
- Your team prefers direct per-rule tuning by property type over one shared scale.

### Use `@shadcn/lint` when:

- Your design system is Tailwind v4 components and the drift you fight is pages restyling them: a `p-4` or `bg-pink-500` on a `<Button>` that should have used a size or a variant.
- You want per-component contracts (`^CardTitle$` may change typography but not font weight) and messages that name the component's own variants.
- Your CSS is small and the class strings are where the decisions live. It reads JSX, TSX, Vue, Svelte and Astro class sites; it does not read stylesheets.

### Rhythmguard and `@shadcn/lint` together

They overlap on one thing: an arbitrary spacing value in a class string. `@shadcn/lint`'s `no-arbitrary-values` reports `p-[13px]` and suggests the equivalent step; Rhythmguard's `tailwind-class-use-scale` reports it against your scale and fixes it to `p-3`. Everything else is disjoint. `@shadcn/lint` decides what a component allows and reads the theme only for colors, radii and text sizes. Rhythmguard decides whether a spacing value is on the project's scale in CSS, SCSS, CSS Modules and class strings, infers that scale from tokens, audits and baselines a codebase, and follows token chains to their values. A Tailwind team can run both: `@shadcn/lint` on the components, Rhythmguard on the stylesheets and the audit, and pick one of the two for arbitrary spacing classes so a finding is reported once.

## Recommended rollout order in real teams

1. `defensive-css` for safety and accessibility baseline.
2. `logical-css` for directional correctness.
3. `rhythmguard` for scale and token consistency.

## Migration recipes (copy/paste)

## 1) Baseline defensive hardening

```json
{
  "extends": ["stylelint-plugin-defensive-css/configs/recommended"]
}
```

## 2) Add logical CSS enforcement

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended"
  ]
}
```

## 3) Add Rhythmguard scale checks

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/recommended"
  ]
}
```

## 4) Token migration phase (temporary): recommended config plus an audit baseline

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/recommended"
  ]
}
```

## 5) Tight production profile (after migration)

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/strict"
  ]
}
```

## Rhythmguard-specific migration rule block

Use this during transition from literals to tokens:

```json
{
  "rules": {
    "rhythmguard/prefer-token": [
      true,
      {
        "allowNumericScale": true,
        "tokenMapFromCssCustomProperties": true,
        "tokenMapFromTailwindSpacing": true,
        "tailwindConfigPath": "./tailwind.config.mjs"
      }
    ]
  }
}
```

## Tailwind class-string companion (ESLint)

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: {
      'rhythmguard-tailwind': rhythmguard,
    },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
    },
  },
];
```

