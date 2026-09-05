# Shared configs

Every config is a one-line `extends`. Pick the first one that fits and move down the list as your token system matures.

| Config | Enables | Use when |
| --- | --- | --- |
| `recommended` | `use-scale` on the spacing group | You want spacing on a scale and nothing else decided for you |
| `strict` | `use-scale` + `prefer-token` + `no-offscale-transform` | Tokens exist and raw literals should be errors |
| `tailwind` | `strict` + `stylelint-config-tailwindcss` + `@theme` token extraction | Tailwind v3 or v4 project |
| `react-tailwind` | `tailwind` + CSS Modules overrides + Next.js build ignores | Next.js or React with Tailwind and CSS Modules |
| `expanded` | `use-scale` across spacing, radius, typography and size groups | You also want radii, type and size on scales |
| `logical` | `strict` + `stylelint-plugin-logical-css` recommended | Internationalised UI using logical properties |
| `migration` | `prefer-token` with `allowNumericScale: true` and automatic token maps | Transition period from literals to tokens |
| `motion` | `use-motion-scale` | Opt-in duration, delay and easing checks. Experimental |

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]
}
```

Entry points follow the same pattern for every row: `stylelint-plugin-rhythmguard/configs/<name>`. Each is also available on the plugin object as `configs.<name>` and has a TypeScript declaration.

`strict` removes `transform` from `use-scale` and hands translations to `no-offscale-transform` so one off-scale translation produces one report.

Framework snippets for Vue, Lit, Astro and SvelteKit, which need `postcss-html` or `postcss-lit`, are in [`FRAMEWORKS.md`](./FRAMEWORKS.md).

## Full custom setup

Everything the configs do is plain rule options. This block is `strict` written out with the common knobs turned:

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [
      true,
      {
        "preset": "rhythmic-4",
        "propertyGroups": ["spacing", "radius"],
        "propertyScales": { "font-size": [12, 14, 16, 20, 24] },
        "units": ["px", "rem", "em"],
        "unitStrategy": "convert",
        "baseFontSize": 16,
        "tokenPattern": "^--space-",
        "tokenFunctions": ["var", "theme", "token"],
        "allowNegative": true,
        "allowPercentages": true,
        "fixToScale": true,
        "enforceInsideMathFunctions": true,
        "mathFunctionArguments": { "clamp": [1, 3] }
      }
    ],
    "rhythmguard/prefer-token": [
      true,
      {
        "tokenPattern": "^--space-",
        "allowNumericScale": false,
        "tokenMapFromCssCustomProperties": true,
        "tokenMapFromTailwindSpacing": true,
        "tailwindConfigPath": "./tailwind.config.mjs",
        "tokenMap": {
          "4px": "var(--space-1)",
          "8px": "var(--space-2)",
          "12px": "var(--space-3)",
          "16px": "var(--space-4)"
        }
      }
    ],
    "rhythmguard/no-offscale-transform": [true, { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

Option reference per rule: [`use-scale`](./rules/use-scale.md), [`prefer-token`](./rules/prefer-token.md), [`no-offscale-transform`](./rules/no-offscale-transform.md), [`use-motion-scale`](./rules/use-motion-scale.md).

## Choosing a scale

```json
{ "rules": { "rhythmguard/use-scale": [true, { "preset": "fibonacci" }] } }
```

```json
{ "rules": { "rhythmguard/use-scale": [true, { "customScale": [0, 6, 12, 18, 24, 36, 48] }] } }
```

Resolution precedence: `customScale`, then `scale`, then `preset`, then the default `rhythmic-4`. The preset catalogue is in [`SCALE_PRESETS.md`](./SCALE_PRESETS.md).

## Option validation

Rhythmguard validates every rule's secondary options before linting. Unknown option names, wrong shapes, unknown property names, unknown property groups, and invalid math-function argument maps all fail immediately as Stylelint invalid-option warnings. A typo like `"sevverity": "warning"` is reported rather than silently ignored.

## Autofix policy

Only deterministic fixes are applied: nearest scale value for off-scale literals, and explicit token-map replacements. The rules never guess a token. Teams whose visuals have not been reviewed against the scale usually run at warning level with `fixToScale: false` and ratchet with [`rhythmguard audit`](./AUDIT.md).
