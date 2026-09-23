---
title: "State of Spacing, September 2026: what 58 public design systems do with their own spacing scale"
published: false
tags: css, designsystem, webdev, frontend
canonical_url: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/state-of-spacing/2026-09.md
---

Every design system publishes a spacing scale. This is a measurement of how often the CSS in 58 public repositories uses it.

The method is one command on a pinned commit: read the repository's own spacing tokens (custom properties, Sass maps, or the npm package its maintainers pointed at), then count every literal length in a spacing property that is not on that scale. Hairlines of one pixel or less, percentages, and generated, vendored or test paths are excluded. Every row reproduces in a checkout of the commit it names, and the manifest, snapshots and classification rules are [in the open](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/tree/main/benchmarks/quiet). The full 58-row edition, with commit hashes, is [here](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/state-of-spacing/2026-09.md).

This is not a ranking of teams. Two thirds of the drift in any one repository is a handful of values, and each of those is one decision the team has not had to make yet.

## The numbers

| | |
| --- | ---: |
| Repositories audited | 58 |
| CSS and SCSS files scanned | 8,729 |
| Repositories measured against a scale they defined themselves | 23 |
| Off-scale values in those 23 | 2,052 |
| Of the 23, repositories with zero off-scale values | 3 |
| Repositories with no discoverable tokens, measured against a default 4px scale | 32 |
| Median share of a repository's drift explained by its top three values | 42% |
| Median cleanliness (files with no finding) | 93% |

Only the 23 rows measured against their own scale are shown below. The 32 default-scale rows are in the edition, marked as such, and their counts say more about where those projects keep their tokens than about their CSS. Two SAP repositories are listed without a count because their theming package carries no ladder, and VitePress is listed without one because its maintainers said it has no spacing scale by design.

| Repository | Scale read from | Off-scale values | per 100 CSS files | Top three values |
| --- | --- | ---: | ---: | --- |
| [mastodon](https://github.com/mastodon/mastodon) | its own tokens | 568 | 1578 | `10px` ×165, `15px` ×112, `5px` ×70 |
| [grafana](https://github.com/grafana/grafana) | its own tokens | 77 | 1283 | `$popover-arrow-size` ×16, `10px` ×9, `15px` ×9 |
| [adminlte](https://github.com/ColorlibHQ/AdminLTE) | `bootstrap` (installed) | 133 | 289 | `10px` ×20, `1.25rem` ×9, `2px` ×9 |
| [n8n-design-system](https://github.com/n8n-io/n8n) | its own tokens | 147 | 191 | `5px` ×44, `10px` ×29, `0.6em` ×10 |
| [discourse](https://github.com/discourse/discourse) | its own tokens | 570 | 152 | `5px` ×147, `0.15em` ×38, `3px` ×36 |
| [carbon-styles](https://github.com/carbon-design-system/carbon) | `@carbon/layout` (installed) | 212 | 75 | `13px` ×28, `7px` ×19, `3px` ×16 |
| [primer-css](https://github.com/primer/css) | `@primer/primitives` (installed) | 69 | 61 | `5px` ×17, `7px` ×9, `10px` ×8 |
| [materialize](https://github.com/materializecss/materialize) | its own tokens | 9 | 60 | `10px` ×3, `15px` ×2, `14px` ×1 |
| [bulma](https://github.com/jgthms/bulma) | its own tokens | 37 | 49 | `2em` ×7, `-0.375em` ×5, `0.375em` ×4 |
| [bootstrap](https://github.com/twbs/bootstrap) | its own tokens | 53 | 43 | `.125rem` ×9, `.75rem` ×8, `1.25rem` ×8 |
| [mantine](https://github.com/mantinedev/mantine) | its own tokens | 36 | 35 | `4px` ×6, `5px` ×6, `2px` ×4 |
| [nhsuk-frontend](https://github.com/nhsuk/nhsuk-frontend) | its own tokens | 28 | 19 | `-6px` ×7, `2px` ×5, `6px` ×5 |
| [bootstrap-v6](https://github.com/twbs/bootstrap) | its own tokens | 19 | 13 | `.125rem` ×9, `-.125rem` ×1, `-100px` ×1 |
| [govuk-frontend](https://github.com/alphagov/govuk-frontend) | its own tokens | 24 | 8 | `2px` ×6, `14px` ×2, `3px` ×2 |
| [tachyons](https://github.com/tachyons-css/tachyons) | its own tokens | 5 | 8 | `0.35em` ×1, `0.625em` ×1, `0.67em` ×1 |
| [tabler](https://github.com/tabler/tabler) | its own tokens | 12 | 6 | `-90px` ×3, `85px` ×3, `-2px` ×1 |
| [primer-react](https://github.com/primer/react) | `@primer/primitives` (installed) | 11 | 5 | `10px` ×4, `3px` ×4, `-15px` ×1 |
| [radix-themes](https://github.com/radix-ui/themes) | its own tokens | 7 | 5 | `5px` ×3, `3px` ×2, `-2px` ×1 |
| [uswds](https://github.com/uswds/uswds) | its own tokens | 30 | 4 | `0.25em` ×4, `10px` ×4, `20px` ×4 |
| [coreui](https://github.com/coreui/coreui) | its own tokens | 5 | 3 | `-.375rem` ×2, `.1rem` ×1, `2px` ×1 |
| [mittwald-flow](https://github.com/mittwald/flow) | `@mittwald/flow-design-tokens` (installed) | 0 | 0 | none |
| [patternfly](https://github.com/patternfly/patternfly) | its own tokens | 0 | 0 | none |
| [skeleton](https://github.com/skeletonlabs/skeleton) | its own tokens | 0 | 0 | none |

## Three things the table says

**Drift is concentrated.** Across the 35 repositories with at least twenty findings, the top three values explain a median 42% of them. Mastodon defines a real scale in `--space-*` custom properties and steps off it 568 times, but 61% of that is three numbers: `10px` ×165, `15px` ×112, `5px` ×70. Deciding whether `10px` is a missing step, a slip, or a token nobody defined is one conversation. It is not 165 code reviews.

**`10px` and `5px` are the values that drift.** In the 23 repositories measured against their own scale, `10px` is a top-three value in 8. Across every measured row, the most frequent off-scale values are `10px` (1,091 occurrences), `5px` (842) and `20px` (331). Most published scales are built on 4 or 8; most hands reach for 5 and 10.

**`padding` is where it happens.** Property tables are led by `padding` (2,716 findings across the set) and then `margin` (1,123). Sibling margins point at a parent that could own the spacing with `gap`; `padding` is component-internal and is fixed one component at a time.

## What maintainers said, and what it changed

Every repository whose tracker accepts a free-form issue got one with its audit attached before this edition was published, and about a dozen maintainers replied. The replies are paraphrased here and linked in the [outreach log](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/outreach/embed-log.md).

- **The scale lives in a package.** Primer's ladder is `--base-size-*` from `@primer/primitives`; AdminLTE inherits Bootstrap's `$spacers`; mittwald Flow's steps are `--size-px--*` in `@mittwald/flow-design-tokens`. A source scan cannot see any of that. Those rows are now measured against the installed package at a pinned version. Primer CSS went from 103 findings against its consumer tokens to 69 against its real ladder; mittwald Flow went from 2 to 0.
- **Components reach the scale through a token layer**, so a literal scan measures the wrong layer (mittwald). The audit now follows `var()` chains from spacing tokens to their terminal values and reports which chains resolve on the scale, off it, or to a computed expression.
- **Some values are not rhythm.** PatternFly's fourteen findings were four in vendored Font Awesome and ten in documentation examples, none in component SCSS; the row is labelled accordingly and reads zero.
- **Some projects have no scale by design** (VitePress) or a scale that varies by theme (SAP's two repositories). Those rows carry no count.

## Reading your own repository

The same command runs in any checkout:

```bash
npx stylelint-plugin-rhythmguard
```

It detects the stack, reads the project's own tokens, and prints the scale it found, where it found it, the off-scale count, and the top values and properties. If it says the scale came from a fallback, the project has no discoverable spacing tokens and the count is not a verdict on the CSS. Fix that first.

The three questions worth asking of the output, in order: which three values explain most of the count, whether each is a missing step or a slip, and which property leads the table.

## Method and caveats

- Pinned commits, sparse checkouts limited to the paths in the manifest, findings classified by path heuristics and, where a maintainer replied, by per-repository labels. CI reruns the set on every change to the tool and fails when a finding moves.
- Sass expressions in declarations are evaluated when the variables resolve from the linted file or a known token source (`$spacer * .3` reports as 4.8px). Unresolvable terms are left alone, so systems that route every length through a function still under-report.
- The false-positive rate in the table is heuristic, then corrected by review where a maintainer engaged. Twelve of the fifty-eight repositories have. If a row about your project is wrong, the [issue linked from it](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/outreach/embed-log.md) is the place to say so, and the next edition will carry the correction.

The next edition is due in December 2026 over the same pinned commits, with a column for the change.
