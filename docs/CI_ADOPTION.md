# CI Adoption Recipe

Use this rollout when a codebase already has spacing drift and you want Rhythmguard to block only new regressions.

## 1. Create the baseline

Run this once on the current codebase and commit the generated file:

```bash
npx rhythmguard audit ./src --write-baseline
git add .rhythmguard-baseline.json
```

The baseline records known findings. Future checks can compare against it without forcing a full cleanup first.

## 2. Add the GitHub Actions job

```yaml
name: Rhythmguard

on:
  pull_request:

jobs:
  rhythmguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Audit design-system drift
        run: |
          npx rhythmguard audit ./src \
            --since origin/${{ github.base_ref }} \
            --since-baseline \
            --fail-on-new-drift \
            --format markdown \
            --output rhythmguard-report.md

      - name: Upload Rhythmguard report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: rhythmguard-report
          path: rhythmguard-report.md
```

For repos without a committed baseline, remove `--since-baseline` and `--fail-on-new-drift`, then gate with `--max-findings 0` only after the first cleanup pass.

## 3. Post a PR comment

The markdown output is designed for review comments:

```bash
npx rhythmguard audit ./src --format markdown --output rhythmguard-report.md
gh pr comment "$PR_NUMBER" --body-file rhythmguard-report.md
```

If you prefer generated artifacts, use HTML:

```bash
npx rhythmguard audit ./src --format html --output rhythmguard-report.html
```

## 4. Tighten gradually

Recommended rollout order:

1. `--format markdown` only: visibility without blocking.
2. `--write-baseline`: freeze existing drift.
3. `--since-baseline --fail-on-new-drift`: block new drift only.
4. `--min-cleanliness 95` or `--max-findings 0`: move from regression blocking to active cleanup.

Keep motion checks opt-in until the team has reviewed local false positives:

```bash
npx rhythmguard audit ./src --include-motion --format markdown
```
