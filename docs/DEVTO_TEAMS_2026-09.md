---
title: We audited 20 design systems for spacing drift. Here is what teams can use from it.
published: false
tags: css, designsystem, tailwindcss, webdev
canonical_url: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/QUIET_BENCHMARK.md
---

Nobody on your team chose 13px. Someone pasted it, or nudged 12px until a border lined up, or a coding agent produced it because it had no idea your scale stops at 12 and 16. Six months later `git grep` finds forty distinct spacing values and the design system's spacing page describes a project that no longer exists.

This spring I pointed Rhythmguard, the Stylelint plugin I maintain for spacing scales, at twenty public design systems to find out how quiet it could be on code I do not control. The results changed the tool more than any feature request has. Here is what a team can take from them, whether or not you use this plugin.

## What twenty repositories showed

The benchmark clones Radix Themes, Mantine, shadcn/ui, Primer React and CSS, Liveblocks, Bootstrap, Penpot, Mastodon, Gutenberg's component package, GitLab UI, Pico, Bulma, Spectrum CSS, USWDS, Carbon, Salesforce Lightning, wp-calypso's components, Open Props and mittwald Flow at pinned commits, runs the audit, and classifies every finding as real drift or as noise the tool should not have raised.

Three things held across the set.

**Drift concentrates in a few values.** Mastodon defines a spacing scale as custom properties, `--space-3xs` at 2px up to `--space-5xl` at 40px. Its stylesheets ignore that scale 564 times. `10px` accounts for 165 of those, `15px` for 112, `5px` for 70. Three values explain two thirds of the drift. When you audit your own codebase, expect the same shape: fix the top three values and you have fixed most of the problem, and each of those three is a single design decision, not hundreds.

**Systems that route spacing through Sass are invisible to a CSS-level check.** Bootstrap's `$spacer`, USWDS's `units()`, Carbon's `spacing()` and Lightning's `$spacing-*` never appear as literal lengths in output the linter reads before compilation. Those repositories show few findings and the audit falls back to a default scale because it cannot find their tokens. A clean report on a Sass-heavy codebase says the tool could not see your scale. It does not say your spacing is consistent. Ask which one you are looking at before you celebrate.

**Two classes of finding were wrong on every repository, and a team would have disabled the rule over them.** The tool reported percentage translations such as `translate(-50%, -50%)` as raw values in need of a token. It reported one-pixel offsets as off-scale: `margin: -1px` over a neighbouring border, `inset: 1px` on a focus ring, `translateY(1px)` for subpixel rendering. In Primer React those hairlines were 46% of all findings. No maintainer would accept either class, so each one was a reason to turn the rule off, and a rule that is off enforces nothing.

## What changed in the tool, from your side of it

Every change below exists because the benchmark forced it. I describe them as what your team gets, since that is the only reason they matter.

**One command, before anyone configures anything.** `npx rhythmguard` in a repository detects Tailwind, Next.js, an existing Stylelint config and token files, infers your scale from your own tokens, prints the drift summary with the values that dominate, and ends with the exact config to paste. Run it in a planning meeting. The output is the agenda.

**The scale comes from your tokens.** With `scale: "auto"` the rule reads your `--space-*` or `--spacing-*` custom properties, a Tailwind v4 `--spacing` base, values written as `calc(4px * var(--scaling))` the way Radix does it, or a token file you point at, and it tells you which source it used. Nobody has to type the scale into a config and then forget to update it when the tokens change. If the tool finds fewer than three token values it falls back to a 4px preset and says so in the first message, rather than trusting a scale of one.

**Quiet by default, loud on request.** Percentages are never findings. Hairlines of one CSS pixel or less are exempt through `allowHairlines`, which you can set to `false` if your team renders hairlines through a token and wants them caught. After those two changes the heuristic false-positive rate across all twenty repositories is zero. The remaining findings are the list a maintainer would want.

**A one-line entry point for platform teams.** If you publish a shared Stylelint config for other teams, `stylelint-plugin-rhythmguard/configs/embed` is one rule at warning level with the scale inferred per consumer, no other dependencies, and a shape frozen for the 2.x line. Your consumers see spacing warnings in their editor against their own scale without you knowing what that scale is.

**SCSS is in scope.** Install `postcss-scss` and the audit reads `.scss` files too. It still does not evaluate Sass variables, so read the earlier caveat again.

**Agents get instructions, not vibes.** The fastest source of off-scale values in 2026 is the coding agent that wrote the component. A short `AGENTS.md` block in the docs tells an agent to run the audit before finishing, to use the nearest on-scale value or the token, never to invent a spacing value, and not to autofix blindly because snapping changes layout.

## Rolling it out without a fight

Teams that adopted the tool successfully did roughly the same thing, and the one production adopter I could find publicly described the same sequence independently.

1. Audit first, enforce later. `npx rhythmguard audit ./src --format markdown` gives you a report to put in front of the design-system owner. Decide together which of the top values are real decisions.
2. Write a baseline and gate only new drift. `--write-baseline` then `--since-baseline --fail-on-new-drift` in CI means the legacy 564 do not block anyone, while the 565th does.
3. Run the rule at warning level for a quarter. Warnings show up in editors and in PR annotations (`--format github`) and nobody's build fails.
4. Keep autofix off for spacing until you have reviewed the visual impact. Snapping 13px to 12px moves things. Let people choose.
5. Ignore generated and vendored CSS at the config level. The rule cannot tell authored from generated, and one generated file can bury the report.

## What it will not do for you

It does not check colors. The Stylelint rules do not see Tailwind class strings; that is a separate ESLint rule shipped in the same package. It does not evaluate Sass variables or functions. If your tokens live in an npm package rather than in CSS, point `scaleSources` at the built token file or inference falls back. If you expect any of these and do not get them, the tool has not failed, it was never in scope.

## Check the numbers yourself

The benchmark and its snapshots are in the repository under `benchmarks/quiet/`, and the generated report is `docs/QUIET_BENCHMARK.md`. CI reruns it on every change and fails if the findings on any pinned repository move, so the figures above are not a one-off. If the tool reports something on your codebase that your team considers wrong, that is exactly the kind of finding the benchmark exists to catch. A reproduction in an issue is enough.
