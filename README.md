<p align="center">
  <img src="./assets/rhythmguard-banner.svg" width="100%" alt="Rhythmguard banner in Geist Pixel" />
</p>

# stylelint-plugin-rhythmguard

High-precision spacing governance for CSS and design systems.

[![CI](https://img.shields.io/github/actions/workflow/status/petrilahdelma/stylelint-plugin-rhythmguard/ci.yml?branch=main&label=ci)](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18-black.svg)](https://nodejs.org/)

`stylelint-plugin-rhythmguard` enforces spacing discipline across margin, padding, gap, inset, scroll spacing, and translate motion offsets.

It is built for teams that want:

- zero random spacing values in production CSS
- token-first spacing workflows
- predictable autofix behavior for large migrations
- consistent layout rhythm across web surfaces

## Rule Matrix

<p align="center">
  <img src="./assets/rhythmguard-rules.svg" width="100%" alt="Rhythmguard rule matrix visual" />
</p>

| Rule | What it does | Autofix |
| --- | --- | --- |
| `rhythmguard/use-scale` | Enforces spacing values must be on your configured scale | Yes, nearest safe value |
| `rhythmguard/prefer-token` | Enforces token usage over raw spacing literals | Yes, with `tokenMap` |
| `rhythmguard/no-offscale-transform` | Enforces scale-aligned `translate*` motion offsets | Yes, nearest safe value |

## Installation

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

## Quick Start

### Recommended config

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]
}
```

### Strict config

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "extends": ["stylelint-plugin-rhythmguard/configs/strict"]
}
```

### Full custom setup

```json
{
  "plugins": ["stylelint-plugin-rhythmguard"],
  "rules": {
    "rhythmguard/use-scale": [
      true,
      {
        "preset": "rhythmic-4",
        "units": ["px", "rem", "em"],
        "baseFontSize": 16,
        "tokenPattern": "^--space-",
        "tokenFunctions": ["var", "theme", "token"],
        "allowNegative": true,
        "allowPercentages": true,
        "fixToScale": true
      }
    ],
    "rhythmguard/prefer-token": [
      true,
      {
        "tokenPattern": "^--space-",
        "allowNumericScale": false,
        "tokenMap": {
          "4px": "var(--space-1)",
          "8px": "var(--space-2)",
          "12px": "var(--space-3)",
          "16px": "var(--space-4)"
        }
      }
    ],
    "rhythmguard/no-offscale-transform": [
      true,
      {
        "scale": [0, 4, 8, 12, 16, 24, 32]
      }
    ]
  }
}
```

### Presets and custom scales

Preset-based setup:

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "preset": "fibonacci" }]
  }
}
```

Custom scale setup:

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "customScale": [0, 6, 12, 18, 24, 36, 48] }]
  }
}
```

Scale resolution precedence:

1. `customScale` (highest priority)
2. `scale`
3. `preset`
4. default `rhythmic-4` scale

## Built-in Scale Presets

| Preset | Pattern | Scale |
| --- | --- | --- |
| `rhythmic-4` | 4pt rhythm | `[0,4,8,12,16,24,32,40,48,64]` |
| `rhythmic-8` | 8pt rhythm | `[0,8,16,24,32,40,48,64,80,96]` |
| `compact` | dense UI spacing | `[0,2,4,6,8,12,16,20,24,32]` |
| `fibonacci` | Fibonacci progression | `[0,2,3,5,8,13,21,34,55,89]` |
| `powers-of-two` | geometric doubling | `[0,2,4,8,16,32,64,128]` |
| `golden-ratio` | ratio 1.618 | generated modular sequence |
| `modular-minor-third` | ratio 1.2 | generated modular sequence |
| `modular-major-third` | ratio 1.25 | generated modular sequence |
| `modular-perfect-fourth` | ratio 1.333 | generated modular sequence |

Aliases:

- `4pt` → `rhythmic-4`
- `8pt` → `rhythmic-8`
- `golden` → `golden-ratio`
- `minor-third` → `modular-minor-third`
- `major-third` → `modular-major-third`
- `perfect-fourth` → `modular-perfect-fourth`

## Rule Details

### `rhythmguard/use-scale`

Enforces spacing literals to stay on a configured numeric scale.

Checks:

- `margin*`, `padding*`
- `gap`, `row-gap`, `column-gap`
- `inset*`, `scroll-margin*`, `scroll-padding*`
- `translate`, `translate-x`, `translate-y`, `translate-z`
- `transform` translation functions (`translate`, `translateX`, `translateY`, `translateZ`, `translate3d`)

Example:

```css
/* ❌ Off-scale */
.card {
  margin: 13px;
  transform: translateY(18px);
}

/* ✅ On-scale */
.card {
  margin: 12px;
  transform: translateY(16px);
}
```

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preset` | `string` | `rhythmic-4` | Selects a built-in spacing scale |
| `customScale` | `Array<number|string>` | `undefined` | Highest-priority custom scale override |
| `scale` | `Array<number|string>` | `[0,4,8,12,16,24,32,40,48,64]` | Allowed spacing values |
| `units` | `string[]` | `['px','rem','em']` | Units considered for scale enforcement |
| `baseFontSize` | `number` | `16` | Used for `rem`/`em` conversion |
| `tokenPattern` | `string` | `^--space-` | Regex for accepted token variable names |
| `tokenFunctions` | `string[]` | `['var','theme','token']` | Functions treated as tokenized values |
| `allowNegative` | `boolean` | `true` | Allows negative scale values |
| `allowPercentages` | `boolean` | `true` | Allows `%` values without scale checks |
| `fixToScale` | `boolean` | `true` | Enables nearest-value autofix |
| `enforceInsideMathFunctions` | `boolean` | `false` | Lints `calc()/clamp()/min()/max()` internals |
| `properties` | `Array<string|RegExp>` | built-in spacing patterns | Override targeted property set |

### `rhythmguard/prefer-token`

Enforces token usage for spacing declarations. This is ideal once your token system is stable.

Example:

```css
/* ❌ Raw literals */
.stack {
  gap: 12px;
  padding: 16px;
}

/* ✅ Tokenized */
.stack {
  gap: var(--space-3);
  padding: var(--space-4);
}
```

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `tokenPattern` | `string` | `^--space-` | Regex for accepted token variable names |
| `tokenFunctions` | `string[]` | `['var','theme','token']` | Functions treated as tokenized values |
| `allowNumericScale` | `boolean` | `false` | Temporary migration mode to permit on-scale literals |
| `preset` | `string` | `rhythmic-4` | Selects a built-in scale used in migration mode |
| `customScale` | `Array<number|string>` | `undefined` | Highest-priority custom scale override |
| `scale` | `Array<number|string>` | `[0,4,8,12,16,24,32,40,48,64]` | Used when `allowNumericScale` is enabled |
| `baseFontSize` | `number` | `16` | Used for scale checks with `rem`/`em` |
| `tokenMap` | `Record<string,string>` | `{}` | Enables autofix from raw value to token |
| `ignoreValues` | `string[]` | CSS global keywords + `auto` | Skips keyword literals |
| `properties` | `Array<string|RegExp>` | built-in spacing patterns | Override targeted property set |

### `rhythmguard/no-offscale-transform`

Specialized guardrail for motion spacing consistency in translation transforms.

Example:

```css
/* ❌ Off-scale motion */
.toast {
  transform: translateY(18px) scale(1);
}

/* ✅ Motion on spacing scale */
.toast {
  transform: translateY(16px) scale(1);
}
```

Options:

`rhythmguard/no-offscale-transform` accepts the same scale options as `rhythmguard/use-scale`, but only for transform translation properties.

## Programmatic Presets

```js
const rhythmguard = require('stylelint-plugin-rhythmguard');

console.log(rhythmguard.presets.listScalePresetNames());
console.log(rhythmguard.presets.scales['rhythmic-4']);
```

## Autofix Philosophy

Rhythmguard only applies deterministic fixes:

- nearest scale value for numeric off-scale literals
- explicit `tokenMap` replacements for token migration

It will not guess token mappings without your map.

## Compatibility

- Stylelint: `^16.0.0`
- Node.js: `>=18.18.0`
- Module format: CommonJS plugin package

## Development

```bash
npm install
npm run lint
npm test
npm run test:coverage
```

## Performance Benchmarking

Compare runtime against `stylelint-scales` on a deterministic spacing corpus:

```bash
npm run bench:perf
```

Benchmark with autofix enabled:

```bash
npm run bench:perf:fix
```

Detailed methodology and custom args are documented in [`docs/BENCHMARKING.md`](./docs/BENCHMARKING.md).

## Release Workflow

1. Create a GitHub release.
2. `release.yml` runs lint + tests.
3. The package is published to npm with provenance (`npm publish --provenance`).

## Visual System Note

The repository visuals are SVG-only, black/white only (`#000` / `#fff`), and use the locally installed **Vercel Geist Pixel** font.

## License

MIT. See [`LICENSE`](./LICENSE).
