# Tailwind v4 apps: results

Measured 2026-11-01 on the sample and definitions fixed in [README.md](README.md), with the two amendments in its change log.

**Status: provisional.** The ratings are the agent's pre-ratings. The pass mark uses the maintainer's ratings, due by 2026-11-15 ([REVIEW.md](REVIEW.md)). The second criterion fails by a wide margin (4 drift findings against a bar of 33), so only a very different set of ratings would change the outcome.

Reproduce:

```bash
node scripts/bench/tailwind-v4/measure.mjs
```

```bash
node scripts/bench/tailwind-v4/review.mjs
```

## The pass mark

| Criterion | Bar | Result | Verdict |
| --- | --- | --- | --- |
| Apps with one or more off-scale rhythm findings outside `components/ui/` | 10 of 20 | 15 of 20 (15 before amendment 1) | Pass |
| Reviewed findings rated drift | 33 of 41 (80%, amendment 2) | 4 of 41 (10%) | **Fail** |

The plan's rule for a fail: ship items 5 to 8 (Oxlint job, clean install without Stylelint, bulk-suppression docs, the ESLint front door) and keep the ESLint plugin a companion. Items 1 to 4, the scale-aware rule and v4 step checking, are not built.

The fail does not depend on close calls. Counting every *undeclared token* and every *unclear* rating as drift gives 31 of 41 (76%), still below 80%.

## The review

| Rating | Count | What it covered |
| --- | ---: | --- |
| Undeclared token | 22 | One off-scale value used 5 to 43 times in the same app: 5px in Sim (43 uses) and Supabase (12), 18px in Reactive Resume (27), Next AI Draw.io (13) and Novu (9), 3px in Novu (18) and Sim (17), 26px in Infisical (12) |
| Intentional | 10 | Clearing the macOS traffic lights, indenting past a 16px chevron, centring text on a 44px avatar, a search-icon inset, illustration geometry, optical offsets copied from shadcn's input group |
| Unclear | 5 | Indents that likely align to a column the snippet does not show |
| Drift | 4 | A tooltip's `gap-1.75`, a separator's `mx-[5px]` (twice), a section's `py-[18px]` |

## What the 20 apps look like

- **700 off-scale rhythm findings**: 613 bracketed (`py-[5px]`), 87 v4 steps (`gap-4.5`, `px-0.75`). Amendment 1 removed 4 that were not classes (SVG path data, a branch id).
- **Concentrated.** Sim (235) and Reactive Resume (169) hold 58% of them. The median app has 1.25 findings per 100 TSX/JSX files. Five apps have none: Stirling-PDF, career-ops, Dokploy, Homepage and invisible_dots.
- **Repeated, not scattered.** 511 of the 700 (73%) use a value that appears 5 or more times in the same app. Across all apps the most common are 5px (99), 18px (74), 3px (68), 9px (58), 6.5px (55) and 7px (36). These are spacing conventions the theme never declares, not one-off slips.
- **Nobody declares a scale.** One app of 20 sets a spacing token in `@theme`: Supabase's `--spacing-content: 21px`, a layout width. The other 19 use Tailwind's default `--spacing` and nothing else. The plan has v4 step checking off without a declared scale, so in this sample it would fire nowhere. Run against the default step list instead, it mostly finds the conventions above.
- **Exact equivalents are common and already covered.** 504 bracketed values equal a default step (`p-[12px]` for `p-3`) in 15 apps. eslint-plugin-better-tailwindcss and @shadcn/lint already rewrite those.
- **Position utilities** (`top`, `inset`, `translate`) add 276 off-scale values, reported separately and outside the pass mark.

Per app: [`summary.json`](summary.json). Every finding: [`findings.json`](findings.json).

## What this changes, and what it does not

The laundering mechanism is real. Canonicalisation turns `p-[13px]` into `p-3.25`, and no tool then checks the step against a scale. What the sample does not show is teams with a scale for that check to defend. Their off-scale values are mostly conventions repeated dozens of times. A rule that calls each use drift would be noisy, and a team would most likely answer it by disabling the rule.

That points at a different job for Tailwind apps: show a team the scale it actually uses ("you use 5px 99 times and 18px 74 times; your theme declares neither"), the way `rhythmguard audit --scale auto` reads CSS. That is a new feature, so the amended freeze rules it out. It is recorded here as an input to the 2027-03-31 checkpoint, not as a plan change.

## Limits

- The sample is the 20 most-starred public Tailwind v4 apps that topic search finds. Private product code, smaller teams and untagged repositories may differ.
- The default step list stands in for a team scale that none of these apps declares. A team with a declared scale might see more true drift. This sample has no such team.
- The agent rated these first. The maintainer's ratings replace them for the pass mark.
- One commit per app, on one day; TSX and JSX only. Marketing pages inside an app directory are included, and some intentional findings come from them.
