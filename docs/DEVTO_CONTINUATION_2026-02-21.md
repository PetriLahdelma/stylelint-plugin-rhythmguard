---
title: From Spacing Rules to Production Guardrails: Rhythmguard 1.4.1 in Real Teams
published: false
tags: css, stylelint, designsystems, frontend
---

If you already read the first Rhythmguard post, this is the practical continuation: how teams are actually adopting it in production codebases without a big-bang rewrite.

Top note for the original article:

> Updated Feb 21, 2026: v1.4.1 hotfixes (regex matcher determinism + generic scale messaging).

## What changed since the first post

- Safer matching behavior for property-scale regex handling (deterministic matching).
- Cleaner user-facing messaging for scale violations.
- More practical rollout patterns for existing projects and Tailwind-heavy stacks.

## The adoption pattern that works

Most teams fail adoption by enabling everything at once. The better path is phased:

1. Drop in recommended config immediately.
2. Run migration mode to stabilize literals and token mapping.
3. Move to strict governance once tokenization is reliable.
4. Add Tailwind class-string enforcement in ESLint for template coverage.

## Phase 1: Drop-in for existing projects

Install:

```bash
npm install --save-dev stylelint-plugin-rhythmguard
```

Use:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]
}
```

This gives immediate spacing-scale guardrails with deterministic autofix.

## Phase 2: Migration mode (literal-to-token transition)

When teams still have lots of raw numeric values, switch to migration config temporarily:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/migration"]
}
```

Then use token-map helpers:

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

## Phase 3: Production guardrails

Once violations are stable and token migration is mostly complete:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"]
}
```

If you also enforce logical and defensive CSS:

```json
{
  "extends": [
    "stylelint-plugin-defensive-css/configs/recommended",
    "stylelint-plugin-logical-css/configs/recommended",
    "stylelint-plugin-rhythmguard/configs/strict"
  ]
}
```

## Tailwind + ESLint companion setup

Stylelint covers CSS declarations. Tailwind arbitrary values inside class strings need ESLint coverage.

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

Use Stylelint Tailwind config on the CSS side:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

## CI snippet (copy/paste)

```yaml
name: lint-css-governance
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx stylelint "**/*.{css,scss}" --max-warnings=0
      - run: npx eslint . --max-warnings=0
```

## Real before/after lint output

Examples were extracted from public repos:

- `digitaltableteur-nextjs/app/components/Header/Header.module.css`
- `digitaltableteur/nextjs-app/shared/components/Gallery/Gallery.module.css`
- `digitaltableteur/nextjs-app/shared/components/NewsletterWaitlist/NewsletterWaitlist.module.css`

Before:

```text
../../../../tmp/rhythmguard-real-examples.before.css
   3:12  ✖  Unexpected off-scale value "14px". Use scale values (nearest: 12px or 16px).             rhythmguard/use-scale
   8:14  ✖  Unexpected off-scale value "10px". Use scale values (nearest: 8px or 12px).              rhythmguard/use-scale
  15:10  ✖  Unexpected off-scale value "20px". Use scale values (nearest: 16px or 24px).             rhythmguard/use-scale
  19:10  ✖  Unexpected off-scale value "20px". Use scale values (nearest: 16px or 24px).             rhythmguard/use-scale
  26:27  ✖  Unexpected off-scale value "10px". Use scale values (nearest: 8px or 12px).              rhythmguard/use-scale
  26:27  ✖  Unexpected transform translation value "10px". Use scale values (nearest: 8px or 12px).  rhythmguard/no-offscale-transform

✖ 6 problems (6 errors, 0 warnings)
  6 errors potentially fixable with the "--fix" option.
```

After `--fix`:

```text
No violations.
```

## Rollout checklist for teams

1. Start with `recommended` in warning mode if your codebase is noisy.
2. Enable `migration` while token maps are being built.
3. Track lint deltas per PR.
4. Move to `strict` and fail CI on regressions.
5. Pair with ESLint Tailwind companion rules to cover class strings.

## Final note

The biggest win is not “fewer lint errors.” It is predictable, reviewable spacing decisions across teams and repositories.

