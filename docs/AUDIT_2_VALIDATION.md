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

## Follow-Up Roadmap

1. Add baseline mode:
   - `rhythmguard audit ./src --write-baseline`
   - `rhythmguard audit ./src --since-baseline`
2. Add HTML report output for design reviews.
3. Add token contract reporting:
   - tokens defined but unused
   - tokens used but missing
   - repeated raw values that should become tokens
4. Add CI threshold flags:
   - `--max-findings`
   - `--min-cleanliness`
   - `--fail-on-new-drift`
5. Add Figma-friendly export after the code-side contract stabilizes.

