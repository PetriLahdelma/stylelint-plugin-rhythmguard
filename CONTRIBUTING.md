# Contributing to Rhythmguard

Thank you for being here. Rhythmguard is a small, opinionated tool with one job: keep spacing on a scale. Most of the useful work on it is small too, and a first contribution can land in an afternoon. This page tells you where the useful work is, how the checks run, and what to expect from review.

## Ways to contribute

**Report a false positive.** A finding your team considers wrong is the most valuable report we get. It is how percentages and hairlines stopped being findings. Open a [false-positive report](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/new?template=false-positive.yml) with the CSS or class string and your config. No fix required.

**Add a repository to the quiet benchmark.** The benchmark audits public design systems and fails CI when the findings change. Adding a repo is one JSON entry in `benchmarks/quiet/repos.json` plus `npm run bench:quiet -- --only <name>` to create its snapshot. Systems with tokens in unusual places are the most useful additions. The same results feed the dated [State of Spacing](./docs/STATE_OF_SPACING.md) editions, so every repository you add widens that report.

**Review a drift list.** Each benchmark repo has a list of findings that heuristics call real drift. Labelling them as real or as an allowance in `benchmarks/quiet/labels/<repo>.json` with a one-line reason turns a heuristic number into a reviewed one, and any systematic pattern you find becomes a candidate default.

**Teach inference a new token source.** Sass variables and maps, token packages, framework theme files. If your scale lives somewhere the tool cannot see, the fix is a parser in `src/core/token-sources.js` and a test.

**Improve a rule page.** Every rule has a page under `docs/rules/`. A clearer example or a missing edge case is a welcome PR.

**Contribute a community scale.** JSON files in `scales/community/`, scaffolded with `npm run scales:add -- --name my-team-scale --base 8 --steps 0,4,8,12,16,24,32` and checked with `npm run scales:validate`. Spec and policy in [`docs/COMMUNITY_SCALES.md`](./docs/COMMUNITY_SCALES.md).

Issues labelled [`good first issue`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/labels/good%20first%20issue) are scoped for a first PR. [`help wanted`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/labels/help%20wanted) marks work the maintainer would like a second pair of hands on. If you want to work on something larger, open an issue first so we can agree the shape before you write code.

## Getting set up

```bash
git clone https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard.git
cd stylelint-plugin-rhythmguard
npm ci
npm test
```

Node 20.19 or newer. No build step; the source runs as is. Tests use `node --test` and take about five seconds.

## The local gate

Run these before you push. They are what CI runs, so a green local run means a green PR.

```bash
npm run lint        # eslint
npm run typecheck   # the published TypeScript declarations against a consumer file and the examples
npm test            # 150+ tests, Stylelint 16
```

Optional, depending on what you touched:

```bash
npm run test:compat-floor      # Stylelint 16.0.0, the oldest supported
npm run test:pack-smoke        # pack the tarball and install it in a temp project
npm run scales:validate        # community scale JSON
npm run bench:quiet -- --check # findings on the benchmark repos must match snapshots
```

If your shell's npm registry is overridden by a corporate `.npmrc`, add `--registry https://registry.npmjs.org` to `npm ci` and prefix `test:pack-smoke` with `npm_config_registry=https://registry.npmjs.org`.

### Pull requests from forks

CI for this repository runs on self-hosted runners for pushes and same-repo branches. For pull requests from forks a separate job runs on GitHub-hosted runners with Node 22 and current Stylelint 16, covering lint, typecheck and the test suite. You will see its result on your PR. The full matrix and the benchmark run after merge.

## How we write changes

**Tests first.** Every behaviour change starts with a failing test. If you send a fix without one, expect the review to ask for it; the test is what proves the fix is the right one and keeps it that way.

**Rules explain their defaults.** A new default, or a change to one, needs a written reason on the rule's page under `docs/rules/` and, where the benchmark can show it, a number. The hairline section in [`docs/rules/use-scale.md`](./docs/rules/use-scale.md#hairlines) is the model.

**The benchmark is the regression suite for real code.** If your change alters findings on any benchmark repository, `npm run bench:quiet -- --check` fails and prints the diff. Review it. If the new findings are right, run `npm run bench:quiet -- --update-snapshots`, commit `benchmarks/quiet/snapshots/`, and say in the PR why they are right.

**Fixes are deterministic.** Autofix snaps to the nearest scale step or to an explicit token map. It never guesses a token. Keep that property.

**Prose without em dashes.** House style, applied to docs and messages alike.

## Semver

- Patch: bug fixes, docs, internal changes.
- Minor: new options, presets, sources, or behaviour that does not change existing reports.
- Major: any change to default reports for existing configs, to autofix behaviour, or to exported entry points.

`configs/recommended`, `configs/strict`, `configs/tailwind` and `configs/embed` stay stable within a major. The `embed` config's shape is frozen for 2.x because shared configs depend on it.

## Compatibility

- Stylelint `^16.0.0 || ^17.0.0`. The 16.0.0 floor has known autofix differences; CI runs the floor suite against it.
- Node `>=20.19.0`.
- CommonJS and ESM entry points; every export has a declaration under `types/`.
- One runtime dependency, `known-css-properties`. `postcss-scss`, `stylelint-config-tailwindcss` and `stylelint-plugin-logical-css` are optional peers and dev dependencies here.

## Review

The maintainer aims to respond to issues and PRs within a week. Small PRs merge faster than large ones; if a change can be split, split it. Reviews are about the change, never the person, and the [code of conduct](./CODE_OF_CONDUCT.md) applies everywhere in this project.

## Releases

Maintainer-run. Bump `package.json` and `CHANGELOG.md`, create a GitHub release, and `release.yml` verifies on the self-hosted matrix and publishes through npm trusted publishing (OIDC) from a GitHub-hosted job. Provenance is automatic. The checklist is in [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md).

## Benchmarking performance

```bash
npm run bench:perf
npm run bench:perf:fix
```

Compares runtime against `stylelint-scales` on a deterministic corpus. Method in [`docs/BENCHMARKING.md`](./docs/BENCHMARKING.md).
