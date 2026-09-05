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
npx rhythmguard audit . --ignore "apps/legacy/**" --ignore "vendor/**"
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard audit ./src --staged --max-findings 0
npx rhythmguard audit ./src --since origin/main --min-cleanliness 90
npx rhythmguard audit ./src --token-source ./tokens.json
npx rhythmguard audit ./src --token-source ./theme.css --token-source-format css
npx rhythmguard audit ./src --include-motion
npx rhythmguard audit --schema
```

Scan paths are scoped to the directory argument. Common generated directories are skipped by default. Use `--ignore`, a `.rhythmguardignore` file, or `--ignore-path` for legacy subtrees. `--help` prints every flag.

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

Followed by histograms of off-scale values, token opportunities and Tailwind drift, the token contract, top affected files, and the baseline comparison when one is active.

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

Token source paths in the config resolve from the config file's directory. CLI `--token-source` paths resolve from the current working directory. Supported source formats: CSS custom properties and Tailwind v4 `@theme`, flat JSON, Style Dictionary JSON, and DTCG JSON. CLI scalar flags override config values.

## Baselines and gates

1. `--write-baseline` records current findings in `.rhythmguard-baseline.json`.
2. `--since-baseline` reports only findings not in the baseline.
3. `--fail-on-new-drift` exits 1 when new drift exists. `--max-findings` and `--min-cleanliness` are absolute gates.
4. `--staged` and `--since <ref>` scan only changed files for pre-commit and PR jobs.

The step-by-step rollout, including a GitHub Actions job and a PR comment, is in [`CI_ADOPTION.md`](./CI_ADOPTION.md).

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

- `npx rhythmguard init` detects Tailwind and Next.js and writes a `.stylelintrc.json`.
- `npx rhythmguard doctor` checks that Stylelint is installed, the config is valid, token patterns compile, token sources exist, and baseline and motion settings are consistent.
