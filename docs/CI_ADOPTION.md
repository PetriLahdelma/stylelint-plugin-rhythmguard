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

## 2b. Inline annotations without a formatter

Stylelint 17 removed its built-in GitHub formatter. The audit CLI can emit GitHub Actions workflow commands directly, so every finding shows up as an inline annotation on the pull request diff and the summary appears as a notice:

```yaml
      - name: Rhythmguard annotations
        run: npx rhythmguard audit ./src --format github
```

Run it from the repository root so `file=` paths match the checked-out tree. Combine with `--since-baseline --fail-on-new-drift` to annotate everything but fail only on new drift. `--output` works with this format too if you prefer to `cat` the file in a later step.

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

## 5. Show a badge

`--format badge` writes a shields.io endpoint document. Commit it to a branch that GitHub Pages serves, or push it to a gist, and embed it:

```yaml
name: Spacing badge

on:
  push:
    branches: [main]

jobs:
  badge:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - run: npm ci
      - run: npx rhythmguard audit ./src --scale auto --format badge --output badges/spacing.json
      - name: Publish to the badges branch
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git fetch origin badges || git checkout --orphan badges
          git checkout badges 2>/dev/null || true
          git add badges/spacing.json
          git commit -m "badge: spacing drift" || exit 0
          git push origin badges
```

Then in the README:

```md
![spacing drift](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/badges/badges/spacing.json)
```

`--badge-metric findings` shows the off-scale count instead of the drift percentage.
