# `rhythmguard audit`

Measure design-system drift across a whole tree before you turn rules into hard gates, then ratchet it down in CI.

```bash
npx rhythmguard audit ./src
```

The report covers authored CSS declarations, Tailwind arbitrary spacing values in template and source files, and token-contract drift: spacing tokens used but never defined, tokens defined but never used, repeated raw values that deserve a token, raw values that already match a known token, conflicting token values, and, opt-in, motion rhythm drift.

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
npx rhythmguard audit --schema
```

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

Literal lengths in SCSS are checked. Declarations whose value is a Sass variable or function call are ignored, since Sass is not compiled. For `--scale auto`, however, the audit does read Sass variables and maps as token sources: `$spacer: 1rem`, `$spacing-01: 0.125rem`, and maps such as Bootstrap's `$spacers: (1: $spacer * .25, ...)` including nested maps, variable references, `* / + -` arithmetic and `math.div()`. Function calls it cannot evaluate, strings, keywords and interpolated keys are skipped. Token names appear as `$spacer` or `$spacers.3` in the scale provenance.

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
| `snap` | A slip to fix | Still a finding; `rhythmguard fix` executes it |
| `undecided` | Nobody has looked yet | Still a finding; counted so the team sees it |

Values match by px, so `10px` and `0.625rem` are one decision. The audit reports the counts in `contracts.decisions` (`adopt`, `allow`, `snap`, `undecided`, and `suppressed` findings) and in the summary table; `--plan` keeps decisions already made, with their current counts, and adds `undecided` entries for new values. A rule with `decisions: false` ignores the section; the audit sets that on its own Stylelint run so decisions are applied once, in the audit.

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
- `npx rhythmguard init` detects Tailwind and Next.js and writes a `.stylelintrc.json`.
- `npx rhythmguard doctor` checks that Stylelint is installed, the config is valid, token patterns compile, token sources exist, and baseline and motion settings are consistent.
