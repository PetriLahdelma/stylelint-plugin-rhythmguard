# Audit 2.0 Validation

Rhythmguard's next product step is to become a design-system drift reporter, not a general-purpose CSS quality suite.

## Validation Summary

The Stylelint ecosystem already has strong specialists:

- `stylelint-plugin-defensive-css` for defensive UX, accessibility, and interaction hardening.
- `stylelint-plugin-logical-css` for RTL and writing-mode-safe CSS.
- `stylelint-scales` for broad property-specific numeric scale enforcement.
- Stylelint formatters for CI and review annotations.

Rhythmguard's differentiated lane is design-token and rhythm governance. The strongest next step is therefore a report that turns lint findings into design-system language: scale cleanliness, token adoption, Tailwind arbitrary-value drift, and top affected components.

## Product Bet

UX developers need file-level findings and deterministic fixes. UX designers and design-system owners need a higher-level answer: where is the system drifting, which values keep recurring, and which components should be cleaned up first.

Audit 2.0 serves both groups by scanning:

- CSS declarations through Rhythmguard Stylelint rules.
- Tailwind arbitrary spacing values in common template/source files.
- Token opportunities derived from CSS custom properties and Tailwind-style spacing tokens.

## Delivered Slice

`rhythmguard audit` now emits a unified design-system audit:

```bash
npx rhythmguard audit ./src
npx rhythmguard audit ./src --format markdown
npx rhythmguard audit ./src --json
npx rhythmguard audit . --ignore "apps/legacy/**"
npx rhythmguard audit ./src --write-baseline
npx rhythmguard audit ./src --since-baseline --fail-on-new-drift
npx rhythmguard audit ./src --since origin/main --max-findings 0
```

The report includes:

- CSS files scanned.
- Template files scanned.
- Scale cleanliness.
- CSS off-scale values.
- CSS token opportunities.
- Tailwind class-string drift.
- Top affected files.
- JSON findings for downstream tooling.
- Markdown output for pull requests and design-system reviews.
- Root-relative `--ignore` globs for pruning generated, vendor, or legacy paths before scanning.
- `.rhythmguardignore` / `--ignore-path` reusable scan pruning.
- Baseline comparison for new drift.
- Changed-only scopes with `--staged` and `--since <git-ref>`.
- Token contract reporting for missing, unused, and candidate spacing tokens.
- CI gates with `--max-findings`, `--min-cleanliness`, and `--fail-on-new-drift`.

## Follow-Up Roadmap

1. Add HTML report output for design reviews.
2. Add Figma-friendly export after the code-side contract stabilizes.
3. Add richer token-source configuration for teams whose token declarations live outside the audited source tree.
