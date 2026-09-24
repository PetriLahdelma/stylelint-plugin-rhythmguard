<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.svg?v=12" width="100%" alt="Rhythmguard: stable local evidence for design system drift" />
</p>

# stylelint-plugin-rhythmguard

Nobody chose 13px. Rhythmguard catches off-scale spacing in CSS and Tailwind class strings, tells you the nearest steps on your scale, and snaps to them or to your tokens when you ask.

[![CI](https://img.shields.io/github/actions/workflow/status/petrilahdelma/stylelint-plugin-rhythmguard/ci.yml?branch=main&label=ci)](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/stylelint-plugin-rhythmguard?label=npm&color=1f6feb&r=380)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](./LICENSE)

Rhythmguard is scale-aware rather than a blanket ban: values on your scale pass, values off it are reported with the two nearest steps, and tokens are only ever suggested from a map you control. It works on CSS and SCSS declarations through Stylelint and on Tailwind class strings through an ESLint companion, and it ships an audit CLI so you can measure drift and ratchet it down before enforcing anything.

What it is not: it does not check colors or hex values, and the Stylelint rules do not see Tailwind class strings (that is the separate ESLint companion below). It reads CSS and SCSS; Less and CSS-in-JS are not read. Pair it with a color linter if you need one; do not expect one tool to do both.

## Start here

```bash
npx stylelint-plugin-rhythmguard
```

No install, no config. It detects your stack and token files, infers your spacing scale from your own tokens, audits the current directory, and prints the exact `.stylelintrc.json` (and ESLint snippet for Tailwind) to paste. This is the whole run on Bootstrap's `v6-dev` branch, unedited:

<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/quickstart.gif?v=1" width="100%" alt="Terminal recording: npx stylelint-plugin-rhythmguard on Bootstrap v6-dev detects the stack, infers the 13-step spacing scale from scss/_config.scss, reports 20 off-scale values in CSS and prints a .stylelintrc.json to paste" />
</p>

Then:

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

For class strings in JSX, TSX, Vue, Svelte or Astro, add the ESLint companion from `stylelint-plugin-rhythmguard/eslint`. The same rules will also be published on their own as [`eslint-plugin-rhythmguard`](packages/eslint-plugin-rhythmguard#readme); that package is in this repository but not on npm yet ([#61](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/61)). The rules also run under Oxlint's JS plugins.

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

`recommended`, `strict`, `tailwind`, `motion` (experimental), and `embed` for authors of shared configs (see [docs/FOR_CONFIG_AUTHORS.md](docs/FOR_CONFIG_AUTHORS.md)). All are `stylelint-plugin-rhythmguard/configs/<name>`. What each enables, the full custom setup, and the scale-selection precedence are in [docs/CONFIGS.md](docs/CONFIGS.md). Built-in and community scale presets are in [docs/SCALE_PRESETS.md](docs/SCALE_PRESETS.md).

## Audit before you enforce

With the package installed, the `rhythmguard` command is available to `npx`:

```bash
npx rhythmguard audit ./src --format markdown
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard audit ./src --format github
```

The audit scans CSS declarations, Tailwind class strings and your token contract, prints a scale-cleanliness score, and supports baselines so legacy codebases can gate only new drift. Formats: text, Markdown, JSON 2.0, HTML, GitHub Actions annotations, and a shields.io badge document for your README. Full reference in [docs/AUDIT.md](docs/AUDIT.md), rollout recipe and the badge workflow in [docs/CI_ADOPTION.md](docs/CI_ADOPTION.md). In GitHub Actions, [`PetriLahdelma/rhythmguard-action@v1`](https://github.com/PetriLahdelma/rhythmguard-action) runs the audit, annotates the diff, comments on the pull request and fails on new drift in one step.

`npx rhythmguard audit ./src --plan` turns the report into a proposed `decisions` section (adopt a value, allow it, or snap it), and `npx rhythmguard fix ./src --value 10px --to "var(--space-sm)" --write` executes one decision as one reviewable change; see [decisions](docs/AUDIT.md#decisions). `npx rhythmguard init` writes a starter config for your stack, and `init --agents all` installs the coding-agent instructions. `npx rhythmguard doctor` checks the setup.

## Guides

- [Tailwind integration](docs/TAILWIND.md), including v4 `@theme` tokens and what each layer covers
- [Framework setup](docs/FRAMEWORKS.md) for Vue, Lit, Astro and SvelteKit
- [Comparison with adjacent plugins](docs/COMPARISON.md) and migration recipes
- [Real before/after excerpts](docs/ADOPTION_DIFFS.md) from public codebases
- [For shared-config authors](docs/FOR_CONFIG_AUTHORS.md): the `embed` entry point and how inference works per consumer
- [For coding agents](docs/FOR_AGENTS.md): a paste-ready `AGENTS.md` block, installable with `npx rhythmguard init --agents all` for Claude Code, Cursor and Copilot
- [Quiet benchmark](docs/QUIET_BENCHMARK.md): findings on public design systems, checked on every change
- [State of Spacing](docs/STATE_OF_SPACING.md): dated editions of the same data, ranked by drift density, with the values and properties that drifted
- [Agent evals](docs/AGENT_EVALS.md): does a finding get a coding agent to zero drift, in how many rounds, at what cost, against a rules-only control
- [Architecture](docs/ARCHITECTURE.md): the layers, the rule kit, the invariants and where each is enforced
- [Roadmap](ROADMAP.md): what is planned from October 2026 to June 2027, and the checkpoint that decides the pace
- [Product analysis, September 2026](docs/STRATEGY_2026-09.md): the market data behind the roadmap
- Browser playground: [petrilahdelma.github.io/stylelint-plugin-rhythmguard](https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/) runs the real rules, bundled for the browser, on CSS or SCSS you paste; `scale: "auto"`, tokens and fixes included, and a test proves it reports what Stylelint reports

## Compatibility

Stylelint 16 and 17. Node 20.19 or newer; Node 20 itself is end of life, and 4.0 raises the floor to 22.22 ([#172](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/172)). The ESLint companion needs ESLint 8 or newer, is tested on ESLint 9, and has been checked by hand on ESLint 10 and Oxlint 1.85. Three runtime dependencies (`known-css-properties`, `postcss`, `postcss-value-parser`); `postcss-scss`, `stylelint-config-tailwindcss` and `stylelint-plugin-logical-css` are optional peers. CommonJS and ESM entry points, TypeScript declarations for every export. The CI matrix runs Node 20 and 22 against Stylelint 16.0.0, 16.x and 17.x. Upgrading from 2.x: [docs/MIGRATING_TO_3.md](docs/MIGRATING_TO_3.md).

## Contributing and support

Development setup, semver policy, benchmarking and the release process are in [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and feature requests: [GitHub issues](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/issues). Security: see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
