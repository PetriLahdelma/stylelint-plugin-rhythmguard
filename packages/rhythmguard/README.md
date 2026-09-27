<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.png?v=13" width="100%" alt="Rhythmguard: stable local evidence for design system drift" />
</p>

# rhythmguard

Nobody chose 13px. `rhythmguard` measures off-scale spacing in your CSS, SCSS and Tailwind class strings against the scale your project already defines, and tells you the nearest steps.

[![npm version](https://img.shields.io/npm/v/rhythmguard?label=npm&color=1f6feb)](https://www.npmjs.com/package/rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/rhythmguard.svg)](https://www.npmjs.com/package/rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/LICENSE)

## Start here

```bash
npx rhythmguard
```

No install, no config. It detects your stack and token files, infers your spacing scale from your own tokens, audits the current directory, and prints the exact `.stylelintrc.json` (and ESLint snippet for Tailwind) to paste. This is the whole run on Bootstrap's `v6-dev` branch, unedited:

<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/quickstart.gif?v=1" width="100%" alt="Terminal recording: npx stylelint-plugin-rhythmguard, the same command, on Bootstrap v6-dev detects the stack, infers the 13-step spacing scale from scss/_config.scss, reports 20 off-scale values in CSS and prints a .stylelintrc.json to paste" />
</p>

## Commands

```bash
npx rhythmguard audit ./src --format markdown                  # a report to share in a pull request
npx rhythmguard audit ./src --write-baseline                   # record today's drift
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift   # in CI: fail only on new drift
npx rhythmguard audit ./src --format github                    # inline annotations in GitHub Actions
npx rhythmguard audit ./src --plan                             # propose a decision for every off-scale value
npx rhythmguard fix ./src --value 10px --to "var(--space-sm)"  # one decision as one reviewable change
npx rhythmguard init                                           # starter config for your stack
npx rhythmguard doctor                                         # check the setup
```

Reports come as text, Markdown, JSON, HTML, GitHub annotations or a README badge. Full reference: [docs/AUDIT.md](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/AUDIT.md). In GitHub Actions, [`PetriLahdelma/rhythmguard-action`](https://github.com/PetriLahdelma/rhythmguard-action) runs the audit, comments on the pull request and fails on new drift in one step.

## Where the scale comes from

Your own tokens, in this order: token files you name, spacing custom properties and Tailwind v4 `@theme` in your stylesheets, Sass variables and maps, and installed design-token packages (Bootstrap, Carbon, Primer, PatternFly, Radix, Mantine and others). The report says which source it used. When nothing is found it falls back to a 4px scale and says so.

## What this package is

The command name. It depends on [stylelint-plugin-rhythmguard](https://www.npmjs.com/package/stylelint-plugin-rhythmguard) and runs its CLI; the Stylelint rules, the audit and the ESLint companion ([eslint-plugin-rhythmguard](https://www.npmjs.com/package/eslint-plugin-rhythmguard)) live there. Once the plugin is a dev dependency of your project, `npx rhythmguard` resolves to the same command without this package.

## Compatibility

Node 20.19 or newer. Reads CSS, SCSS (with `postcss-scss` installed) and class strings in JS, TS, JSX, TSX, Vue, Svelte and Astro files. Makes no network requests.

## License

MIT. Issues and contributions: [github.com/PetriLahdelma/stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard).
