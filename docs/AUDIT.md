# `rhythmguard audit`

Measure design-system drift across a whole tree before you turn rules into hard gates, then ratchet it down in CI.

```bash
npx rhythmguard audit ./src
```

The report covers authored CSS declarations, Tailwind arbitrary spacing values in template and source files (including class strings nested inside another literal, such as a ternary in a template literal's `${}`, a Vue `:class` object or array, or a Svelte `{expression}` inside `class="..."`), and token-contract drift: spacing tokens used but never defined, tokens defined but never used, repeated raw values that deserve a token, raw values that already match a known token, conflicting token values, and, opt-in, motion rhythm drift.

## Commands

```bash
npx rhythmguard audit ./src --format markdown          # PR-ready report
npx rhythmguard audit ./src --format json              # stable 2.0 contract
npx rhythmguard audit ./src --format html --output rhythmguard-report.html
npx rhythmguard audit ./src --format github            # GitHub Actions annotations
npx rhythmguard audit ./src --format badge             # shields.io endpoint JSON for a README badge
npx rhythmguard audit . --ignore "apps/legacy/**" --ignore "vendor/**"
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard audit ./src --staged --max-findings 0
npx rhythmguard audit ./src --since origin/main --min-cleanliness 90
npx rhythmguard audit ./src --scale auto
npx rhythmguard audit ./src --token-source ./tokens.json
npx rhythmguard audit ./src --token-source ./theme.css --token-source-format css
npx rhythmguard audit ./src --include-motion
npx rhythmguard audit ./src --check-math-bounds
npx rhythmguard audit --schema
```

`audit.scales` in `.rhythmguardrc.json` checks more property groups, each against its own scale: `{ "typography": [14, 16, 18, 20, 24, 32, 40] }` audits font sizes against the type ladder while spacing keeps `--scale`. Groups are `spacing`, `radius`, `size` and `typography`; a value may be a list, a preset name or `"auto"`. See [A scale per property group](./rules/use-scale.md#a-scale-per-property-group).

`--check-math-bounds` checks the static bounds of fluid values, the `clamp()` minimum and maximum and the length arguments of `min()` and `max()`, which are skipped by default in 3.x. See [Fluid values](./rules/use-scale.md#fluid-values).

Scan paths are scoped to the directory argument. Common generated directories are skipped by default. Use `--ignore`, a `.rhythmguardignore` file, or `--ignore-path` for legacy subtrees. `--help` prints every flag.

## Scale

`--scale 0,4,8,12,16` sets the scale explicitly. `--scale auto` infers one project-level scale and reports where it came from: external `--token-source` files first, then spacing custom properties (`--space-*`, `--spacing-*`) and Sass variables found across the scanned CSS and SCSS, then spacing tokens shipped by installed design-token packages (`source: "token-package"`), then the default `rhythmic-4` values. The JSON contract carries it under `contracts.scale.values`, `contracts.scale.source` and `contracts.scale.files`; text and Markdown output print the scale and its source. A shared config that enables `scale: "auto"` on the rules and an audit run with `--scale auto` therefore agree on the scale.

Root-level declarations win: when custom properties declared in `:root`, `html` or `@theme` form a scale on their own, component-local variables are left out and `contracts.scale.files` lists only the root files. An inferred scale is only used when it looks like one (at least three steps, mostly whole pixels, a common step, and not mostly from component files). When the scan finds tokens that fail that check, the audit falls back to the default and reports the rejection: `contracts.scale.rejected` carries the source, the values and the reasons (for example `no common step`), and the text and Markdown output print `fallback (scanned-css rejected: no common step)` as the scale source. The fix on the project side is a `tokenSources` entry pointing at the real token file, or a tighter token pattern.

## SCSS

`.scss` files are scanned alongside `.css` when `postcss-scss` can be resolved from the audited project or from the plugin. Install it as a dev dependency to opt in:

```bash
npm install --save-dev postcss-scss
```

Without it, SCSS files are counted under `scanned.scssSkipped` and the text and Markdown output say so, rather than failing.

Literal lengths in SCSS are checked, and so are Sass expressions the evaluator can resolve: `padding: $spacer * .3` is reported as `Unexpected off-scale value "$spacer * .3" ... Evaluates to 4.8px.` when `$spacer` is declared in the same file, a `scaleSources` file, the config's token sources or an installed package, and each term of `padding: $y $x` is checked on its own. Expressions over variables it cannot resolve, and functions other than `math.div()`, are left alone; an expression is never rewritten by `--fix`. For `--scale auto` the same reader supplies the scale from Sass variables and maps as token sources: `$spacer: 1rem`, `$spacing-01: 0.125rem`, and maps such as Bootstrap's `$spacers: (1: $spacer * .25, ...)` including nested maps, variable references, `* / + -` arithmetic and `math.div()`. A map declared through `defaults(...)`, `map.merge(...)` or `map-merge(...)` is read as the merged map, later keys winning, which is how Bootstrap v6 declares `$spacers`. Assignments follow Sass: a later plain assignment replaces an earlier `!default`, a later `!default` does not. Other function calls, strings, keywords and interpolated keys are skipped. Token names appear as `$spacer` or `$spacers.3` in the scale provenance.

## Markdown output

```md
# Rhythmguard Design-System Audit

| Metric | Value |
| --- | ---: |
| CSS files scanned | 47 |
| Template files scanned | 83 |
| Files with issues | 12 |
| Total findings | 52 |
| Scale cleanliness | 91% |
| New findings | 3 |
```

Followed by histograms of off-scale values, off-scale properties, token opportunities and Tailwind drift, the token contract, top affected files, and the baseline comparison when one is active.

## Drift by property

Every CSS finding carries the `property` of its declaration (`padding`, `margin-bottom`, `gap`, `transform`). Stylelint reports a position, not a node, so the audit reads the declaration back from the source at that position; a finding inside an at-rule such as `@include` gets `property: null`. The report counts off-scale findings by property in `offScaleProperties`, exposed in the JSON contract as `contracts.scale.offScaleProperties`, and prints the table after the value histogram:

```md
## CSS Off-Scale Properties

| Property | Count |
| --- | ---: |
| `margin-bottom` | 112 |
| `padding` | 41 |
| `gap` | 3 |
```

The value histogram tells you which numbers drifted; the property table tells you where the layout decision lives. A table dominated by margins on siblings usually means the parent should own the spacing with `gap`, which removes the drift in one place instead of one declaration at a time. A table dominated by `padding` is component-internal and is fixed per component. Baselines and the quiet benchmark key findings by file, line and value, so the property does not affect either.

## Badge

`--format badge` writes a [shields.io endpoint](https://shields.io/badges/endpoint) document:

```json
{ "schemaVersion": 1, "label": "spacing drift", "message": "3%", "color": "green" }
```

`drift` (the default) is 100 minus scale cleanliness, the share of scanned files with at least one finding. `--badge-metric findings` reports the number of off-scale CSS values plus Tailwind class-string findings instead, labelled `off-scale values`. Colours: drift 0 to 2% brightgreen, to 5% green, to 15% yellow, above orange; findings 0 brightgreen, to 10 green, to 50 yellow, above orange. Publish the file somewhere public and embed `https://img.shields.io/endpoint?url=<file url>` in the README; the workflow is in [`CI_ADOPTION.md`](./CI_ADOPTION.md#5-show-a-badge).

## Token chains

In a token-layered system the stylesheet says `padding: var(--button--padding-x)` and the discipline lives one level up: does every spacing token resolve to the scale? A literal scan finds almost nothing there. The audit therefore follows every spacing-named custom property (`size`, `space`, `spacing`, `spacer`, `padding`, `margin`, `gap`, `inset` in the name; `font-size`, `letter-spacing` and `word-spacing` excluded) through `var()` references to its terminal values and reports the result as `contracts.tokens.chains`:

| Outcome | Meaning |
| --- | --- |
| `on-scale` | every terminal is a length on the scale |
| `off-scale` | a terminal is a length off the scale: drift at the token layer |
| `unresolved` | the chain reaches a token nobody declares, or a cycle |
| `ambiguous` | definitions disagree on the length (themes, media queries); the set is reported, never a guess |
| `computed` | `calc()` or another expression the audit does not evaluate |
| `non-length` | a shorthand or keyword |

`var(--x, 8px)` uses the fallback when `--x` is not declared. Declarations come from the scanned stylesheets and from token sources and installed token packages, so a scale that lives in a dependency still resolves. The Markdown report prints "6 of 8 spacing tokens resolve to the scale" and lists the tokens that need attention with their chain; the JSON contract carries the counts for every outcome and entries for the attention outcomes only.

## Token ladders

A ladder can have every step on the scale and still not work as a ladder. Fluid type tokens whose `clamp()` minima coincide render three named sizes as one size on every phone; steps 0.8px apart promise a hierarchy no reader can see. The audit groups custom properties into ladders by a shared prefix and a size suffix (`xxs` to `xxl`, `sm`/`md`/`lg`, or `1` to `n`), evaluates each step at its smallest and largest value, and compares neighbours at both ends. It reports the result as `contracts.tokens.ladders`:

| Problem | Meaning |
| --- | --- |
| `collapsed` | two steps are the same size at that end |
| `too-close` | two steps differ by less than `minStepPx` (default 2px) |
| `inverted` | a step is larger than the next one at that end, for example two `clamp()` values that grow at different rates |

A step's value is a static length, the minimum and maximum of a `clamp()`, or the static arguments of `min()` (a maximum) and `max()` (a minimum), followed through `var()`. A step written with `calc()` or a viewport length, or declared with different values in different places, is left out. Each problem names its end: `min`, `max`, or `both`. A ladder needs three evaluable steps; colours and other non-lengths never form one. A ladder whose every step is a `var()` alias of a step on one other ladder (Tailwind `@theme` names over a token file, `--text-body-s: var(--font-size-text-s)`) shares that ladder's problems; it is listed under the other ladder's `aliases` and not counted again.

Inversions are the problem that hides longest. On one production site the audit found `--font-size-title-xl` with a smaller `clamp()` minimum than `--font-size-title-l` (32px against 44px): a mobile retune had lowered one floor and not the other, so below about 390px wide every `h1` rendered smaller than every `h2`. Each step was a reasonable value on its own.

The Markdown report shows each ladder with a problem as a table of its steps, smallest and largest value, and the problem next to the step it concerns:

| Token | Min | Max | Problem |
| --- | --- | --- | --- |
| `--font-size-text-xs` | 14px | 16px | |
| `--font-size-text-s` | 14px | 16.8px | collapsed at min with `--font-size-text-xs`; too close at max with `--font-size-text-xs` |

`"ladders": { "minStepPx": 1 }` under `audit` in `.rhythmguardrc.json` sets the threshold. The section only reports; it adds no findings and does not change the exit code.

## Decisions

Real drift is a handful of decisions, not hundreds of mistakes: Mastodon's `10px` appears 165 times and is one missing step or one unnamed token, not 165 slips. The `decisions` section of `.rhythmguardrc.json` records those decisions once, and both the Stylelint rules and the audit honour them.

```bash
npx rhythmguard audit ./src --plan
```

prints a proposed section with one entry per off-scale value: how often it occurs, the properties it sits on, the two nearest steps, and `"decision": "undecided"`. Paste it into `.rhythmguardrc.json` and decide:

```json
{
  "decisions": [
    { "value": "10px", "decision": "adopt", "as": "--space-2xs" },
    { "value": "15px", "decision": "snap" },
    { "value": "2px", "decision": "allow", "reason": "borders and focus rings", "properties": ["outline-offset", "border-*"] },
    { "value": "22px", "decision": "undecided" }
  ]
}
```

| Decision | Meaning | Effect |
| --- | --- | --- |
| `adopt` | The value is part of the scale; `as` names the token it should become | Stops being a finding in the rules and the audit |
| `allow` | Intentional and not rhythm | Stops being a finding, on every property or only those in `properties` (`border-*` matches a prefix) |
| `snap` | A slip to fix; `to` names the replacement | Still a finding; `rhythmguard fix <dir> --decided` writes `to` wherever the value appears |
| `undecided` | Nobody has looked yet | Still a finding; counted so the team sees it |

Values match by px, so `10px` and `0.625rem` are one decision.

### Executing a decision

```bash
npx rhythmguard fix ./src --value 10px --to "var(--space-sm)"          # list every change
npx rhythmguard fix ./src --value 10px --to "var(--space-sm)" --write  # apply it
npx rhythmguard fix ./src --decided --write                            # every snap decision with a "to"
```

`rhythmguard fix` replaces one value with one replacement on spacing properties (or the ones you pass with `--properties`), matching by px so `0.625rem` is rewritten when you ask for `10px`, keeping the sign (`-10px` becomes `calc(-1 * var(--space-sm))`), and never touching token definitions, values inside `var()`, `theme()` or `token()`, or other properties. It is a dry run until `--write`, it rewrites only files it changed, and running it twice changes nothing. `--decided` applies every snap in one pass over the original values, so with `10px -> 14px` and `14px -> 16px` a `padding: 10px` ends at `14px`, not `16px`, and the dry run lists exactly what `--write` writes. One value per run is deliberate: each run is one reviewable pull request. It skips the files the audit skips: `.rhythmguardignore` (or the file `--ignore-path` names), `audit.ignore` in `.rhythmguardrc.json`, `--ignore`, and generated or vendored directories such as `node_modules` and `dist`. SCSS files are read and written with `postcss-scss`, so `//` comments are left as they are; without it they are skipped and named in the output, never parsed as CSS. The audit reports the counts in `contracts.decisions` (`adopt`, `allow`, `snap`, `undecided`, and `suppressed` findings) and in the summary table; `--plan` keeps decisions already made, with their current counts, and adds `undecided` entries for new values. A rule with `decisions: false` ignores the section; the audit sets that on its own Stylelint run so decisions are applied once, in the audit.

## Config file

Shared settings go in `.rhythmguardrc.json`, loaded automatically when present. `--config <file>` points at another file, `--no-config` skips discovery.

```json
{
  "audit": {
    "ignore": ["legacy/**", "generated/**"],
    "tokenSources": [
      "./tokens.json",
      { "path": "./src/theme.css", "format": "css" }
    ],
    "tokenKind": "spacing",
    "includeMotion": false,
    "checkMathBounds": false,
    "scales": { "typography": [14, 16, 18, 20, 24, 32, 40] },
    "tokenCandidateMinCount": 2,
    "minCleanliness": 90
  }
}
```

A token source object may also carry `tokenPattern`, a regular expression applied to token names instead of the built-in spacing name matcher, for systems whose scale is not called space or spacing (`{ "path": "./node_modules/@mittwald/flow-design-tokens/dist/css/base.css", "tokenPattern": "^--size-(?:px|rem)--" }`). Token source paths in the config resolve from the config file's directory. CLI `--token-source` paths resolve from the current working directory. Supported source formats: CSS custom properties and Tailwind v4 `@theme`, flat JSON, Style Dictionary JSON, and DTCG JSON. CLI scalar flags override config values.

## Baselines and gates

1. `--write-baseline` records current findings in `.rhythmguard-baseline.json`.
2. `--since-baseline` reports only findings not in the baseline.
3. `--fail-on-new-drift` exits 1 when new drift exists. `--max-findings` and `--min-cleanliness` are absolute gates.
4. `--staged` and `--since <ref>` scan only changed files for pre-commit and PR jobs.

The step-by-step rollout, including a GitHub Actions job and a PR comment, is in [`CI_ADOPTION.md`](./CI_ADOPTION.md).


A baseline names each finding by what it is, not where it sits: rule, file, property, value, and its occurrence index among identical findings in that file. Moving code, adding a comment above a declaration or reformatting a file does not turn old findings into "new" and "resolved" pairs; a second identical off-scale declaration is still new. Baseline files carry `formatVersion: 2`; files written by earlier versions (`formatVersion: 1`, keyed by line and column) still compare, with the key they were written with, and are upgraded the next time you run `--write-baseline`. Every output leads with the change since the baseline (`Since baseline: 12 resolved, 0 new`), so a pull request shows what it improved before what it left.

## JSON 2.0 contract and API

`--format json` emits the stable contract (`schemaVersion: "2.0"`). `--format json-v1` keeps the pre-2.0 shape during migration, see [`MIGRATING_TO_2.md`](./MIGRATING_TO_2.md). `--schema` prints the JSON schema.

```json
{
  "schemaVersion": "2.0",
  "command": { "directory": "./src", "scanScope": "full" },
  "summary": { "totalFindings": 12, "scaleCleanliness": 94 },
  "scanned": { "cssFiles": 10, "templateFiles": 20 },
  "contracts": { "scale": {}, "tokens": {}, "motion": {} },
  "findings": { "css": [], "tailwind": [], "motion": [] },
  "baseline": null
}
```

Programmatic use, with TypeScript declarations:

```js
const { createAuditReport, toAuditContractReport } = require('stylelint-plugin-rhythmguard/audit');

const report = await createAuditReport({ dir: './src', noConfig: true });
const contract = toAuditContractReport(report);
```

Dependency-free dashboard and Figma-friendly export examples: [`AUDIT_API_EXAMPLES.md`](./AUDIT_API_EXAMPLES.md). Validation history and product rationale: [`AUDIT_2_VALIDATION.md`](./AUDIT_2_VALIDATION.md).

## Companion commands

- `npx rhythmguard` with no command runs the zero-config quickstart: stack and token detection, inferred scale with provenance, a findings summary, and a paste-ready config.
- `npx rhythmguard init` detects Tailwind and Next.js and writes a `.stylelintrc.json`, or rewrites the JSON config Stylelint already loads (`.stylelintrc` holding JSON, or `.stylelintrc.json`). When Stylelint loads a `stylelint` key in `package.json`, a YAML file, or a JS or TS config, init writes nothing and prints the lines to add to that file, since a new `.stylelintrc.json` would be ignored or would silently replace it.
- `npx rhythmguard doctor` checks that Stylelint is installed, the config is valid, token patterns compile, token sources exist, and baseline and motion settings are consistent. It validates `.rhythmguardrc.json` with the audit's own loader, so it passes exactly the files `rhythmguard audit` accepts: the `audit` section is optional, and `audit` and `decisions` errors are reported with the audit's messages.
