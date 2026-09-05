<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.svg?v=3" width="100%" alt="Rhythmguard banner showing spacing scale ruler and lint output" />
</p>

# stylelint-plugin-rhythmguard

Spacing scale and design-token governance for CSS and Tailwind. `padding: 13px` and `p-[13px]` get reported with the nearest on-scale values, and fixed to them when you ask.

[![CI](https://img.shields.io/github/actions/workflow/status/petrilahdelma/stylelint-plugin-rhythmguard/ci.yml?branch=main&label=ci)](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](./LICENSE)

Rhythmguard is scale-aware rather than a blanket ban: values on your scale pass, values off it are reported with the two nearest steps, and tokens are only ever suggested from a map you control. It works on CSS declarations through Stylelint and on Tailwind class strings through an ESLint companion, and it ships an audit CLI so you can measure drift and ratchet it down before enforcing anything.

## Install

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]
}
```

That enables `rhythmguard/use-scale` on spacing properties with the default 4px scale. Tailwind projects use the `tailwind` config instead, which also extracts spacing tokens from `@theme`:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

For class strings in JSX, TSX, Vue, Svelte or Astro, add the ESLint companion:

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }] },
  },
];
```

## Rules

| Rule | What it reports | Fix |
| --- | --- | --- |
| [`rhythmguard/use-scale`](docs/rules/use-scale.md) | Length values off the configured scale | Nearest scale value |
| [`rhythmguard/prefer-token`](docs/rules/prefer-token.md) | Raw literals where a design token exists | Token from your map |
| [`rhythmguard/no-offscale-transform`](docs/rules/no-offscale-transform.md) | Off-scale `translate*` offsets | Nearest scale value |
| [`rhythmguard/use-motion-scale`](docs/rules/use-motion-scale.md) | Off-scale durations and raw easing curves. Opt-in, experimental | Nearest duration |
| [`rhythmguard-tailwind/tailwind-class-use-scale`](docs/rules/tailwind-class-use-scale.md) | Off-scale Tailwind arbitrary spacing values (`p-[13px]`) in class strings | Nearest scale value |
| [`rhythmguard-tailwind/tailwind-class-use-motion-scale`](docs/rules/tailwind-class-use-motion-scale.md) | Off-scale `duration-[...]`, `delay-[...]`, raw `ease-[...]`. Opt-in | Nearest duration |

Every rule validates its options up front. Unknown option names and wrong shapes are reported, never ignored.

## Configs

`recommended`, `strict`, `tailwind`, `react-tailwind`, `expanded`, `logical`, `migration`, `motion`. All are `stylelint-plugin-rhythmguard/configs/<name>`. What each enables, the full custom setup, and the scale-selection precedence are in [docs/CONFIGS.md](docs/CONFIGS.md). Built-in and community scale presets are in [docs/SCALE_PRESETS.md](docs/SCALE_PRESETS.md).

## Audit before you enforce

```bash
npx rhythmguard audit ./src --format markdown
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard audit ./src --format github
```

The audit scans CSS declarations, Tailwind class strings and your token contract, prints a scale-cleanliness score, and supports baselines so legacy codebases can gate only new drift. Formats: text, Markdown, JSON 2.0, HTML, and GitHub Actions annotations. Full reference in [docs/AUDIT.md](docs/AUDIT.md), rollout recipe in [docs/CI_ADOPTION.md](docs/CI_ADOPTION.md).

`npx rhythmguard init` writes a starter config for your stack. `npx rhythmguard doctor` checks the setup.

## Guides

- [Tailwind integration](docs/TAILWIND.md), including v4 `@theme` tokens and what each layer covers
- [Framework setup](docs/FRAMEWORKS.md) for Vue, Lit, Astro and SvelteKit
- [Comparison with adjacent plugins](docs/COMPARISON.md) and migration recipes
- [Real before/after excerpts](docs/ADOPTION_DIFFS.md) from public codebases
- [Product direction](docs/STRATEGY_2026-09.md)
- Browser playground: [petrilahdelma.github.io/stylelint-plugin-rhythmguard](https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/)

## Compatibility

Stylelint 16 and 17. Node 18.18 or newer for Stylelint 16, Node 20.19 or newer for Stylelint 17. CommonJS and ESM entry points, TypeScript declarations for every export. The CI matrix runs Node 18, 20 and 22 against Stylelint 16.0.0, 16.x and 17.x.

## Contributing and support

Development setup, semver policy, benchmarking and the release process are in [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and feature requests: [GitHub issues](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/issues). Security: see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
