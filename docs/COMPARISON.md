# Defensive CSS vs Logical CSS vs Rhythmguard

This guide helps teams choose the right Stylelint plugin for each problem, then roll them out in a practical order.

## Quick decision matrix

| Tool | Primary problem solved | Best fit |
| --- | --- | --- |
| `stylelint-plugin-defensive-css` | Resilience and accessibility guardrails | UI hardening, interaction safety, reduced-motion, focus behavior |
| `stylelint-plugin-logical-css` | Direction-agnostic and writing-mode-safe CSS | Internationalization, RTL/LTR parity, logical properties and keywords |
| `stylelint-plugin-rhythmguard` | Design-token + spacing-scale governance | Consistent spacing/radius/size/typography and deterministic scale autofix |
| `stylelint-scales` | Property-specific numeric scale enforcement | Teams that want granular scale rules per property category |

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
- Your team prefers direct per-rule tuning by property type over a single governance model.

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

## 3) Add Rhythmguard scale governance

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/recommended"
  ]
}
```

## 4) Token migration phase (temporary)

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/migration"
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

