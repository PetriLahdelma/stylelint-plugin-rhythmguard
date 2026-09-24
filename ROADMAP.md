# Roadmap: October 2026 to June 2027

Written 2026-09-24 from a review of the repository at 3.8.0, the outreach record, and research into competitors and platforms (sources at the end). It replaces the sequencing in sections 6 and 9.10 of [`docs/STRATEGY_2026-09.md`](./docs/STRATEGY_2026-09.md). The strategy's analysis of the market still stands.

Every item links to an issue with a "done when" line. Milestones: [2026 Q4](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/milestone/1), [2027 Q1](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/milestone/2), [2027 Q2](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/milestone/3). This page is revised at the end of each quarter, and the checkpoint on 2027-03-31 can change everything after it.

## 1. Where we are

| | 2026-09-24 |
| --- | --- |
| Version | 3.8.0, twelve releases since 2026-09-05 |
| Quality gate | lint, typecheck, 306 tests, Stylelint 16.0.0 floor, pack smoke; 90% statement coverage |
| Behaviour on real code | 58 public design systems on pinned commits, snapshot-checked on every change |
| npm downloads, last 30 days | 3,910, much of it the maintainer's own CI; weekly volume is about 300 to 700 outside release spikes |
| `rhythmguard`, `eslint-plugin-rhythmguard` on npm | not published; `npx rhythmguard` fails with a 404 in an empty directory |
| Stars, forks, external issues or PRs in this repo | 5, 0, 0 |
| External repositories that depend on it | 2 (fnc314/fnc314.github.io, doctor-school/ds-platform) |
| Audit issues opened on other repositories | 37, with a human reply in 13 |
| Shared configs that embed it | 0; none has been asked yet |

Code quality is not the constraint. Two things are: the first command a stranger copies still fails, and nobody has yet been asked to put Rhythmguard where other people install it.

## 2. What the last three weeks taught us

**Mature design systems will not accept changes that move layout.** Bootstrap will not change v5 Sass because it could break layouts ([twbs/bootstrap#42907](https://github.com/twbs/bootstrap/issues/42907)). USWDS closed a contributor's token PR because three of ten replacements moved spacing by 0.8 to 2px. It said it would reconsider "a change shown to preserve the existing output" ([uswds/uswds#6900](https://github.com/uswds/uswds/issues/6900)). The tool's value for an established system is the ratchet on new drift, plus the fixes that change nothing visible. Snapping old values is a separate decision that needs visual review.

**The audit message explained the tool, not the finding.** Materialize answered "What is this?" and asked for screenshots ([materializecss/materialize#665](https://github.com/materializecss/materialize/issues/665)). Every message now leads with the recipient's own files and lines and the nearest steps, and mentions the tool last.

**Maintainers told us where their scales live, and each answer became a feature.** Primer's `--base-size-*`, mittwald's token package, PatternFly's `spacer` names, GOV.UK and NHS.UK Sass maps, Bootstrap v6's `defaults()` wrapper. Token discovery is the product's core, and real repositories are the only way to find its gaps. Twenty of the targeted repositories could not take a free-form issue at all (seventeen require a template), so that route has limited reach.

**Real repositories break the tool in ways fixtures never do.** Auditing shared-config consumers found an exponential regex that held one audit for eleven hours ([#160](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/pull/160)). It also found an audit that threw on a project's own `.stylelintignore`. And it found vendored CSS leading four reports ([#161](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/161)). A review on 2026-09-24 found DTCG 2025.10 token files silently read as empty ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163)).

## 3. Where the field moved

**@shadcn/lint** launched 2026-09-14 as "an agent-first linter for Tailwind design systems". It had 2,723 stars in ten days and published evals. It rewrites `p-[13px]` to `p-3.25` as "same value, on the scale" and suggests nearby steps only for font sizes and radii, never spacing. It does not lint CSS or SCSS, has no baseline yet ([shadcn-ui/lint#19](https://github.com/shadcn-ui/lint/issues/19)), and has users asking for a skill file because agents route around its rules ([#49](https://github.com/shadcn-ui/lint/issues/49)).

**Tailwind itself** canonicalizes arbitrary values to bare multipliers (`gap-[116px]` becomes `gap-29`, [tailwindcss#19379](https://github.com/tailwindlabs/tailwindcss/pull/19379)). IntelliSense flags the arbitrary form by default. So in a Tailwind v4 project, 13px counts as on-scale for both tools. Only Rhythmguard (and Deslint, with 7 stars) enforces a restricted set of steps, and only Rhythmguard does it in class strings and stylesheets together.

**Nobody sells spacing drift measurement in code.** zeroheight measures components and colours on its Enterprise plan. Figma's Check designs finds hardcoded spacing, but only in design files. Deslint's $99 a month dashboard is "Coming Soon". Specify and Backlight have shut down. The MCP-first design linters (Deslint, @lapidist/design-lint, ux-skill) each have under 100 stars. @shadcn/lint shipped no MCP server and grew on brand, evals and messages written for agents.

**Platforms:**

- **Node:** Node 20 has been end of life since 2026-04-30. Node 24 is the active LTS, and Node 26 becomes LTS on 2026-10-28.
- **ESLint:** version 10 is `latest` (10.11.0). The companion rules report and fix correctly under it (checked 2026-09-24), but CI does not test it.
- **Stylelint 18** is on a `v18` branch with a draft migration guide ([stylelint#9338](https://github.com/stylelint/stylelint/issues/9338)). It raises the Node floor to 22.22 and removes `context.fix`, which Rhythmguard does not use. No date.
- **Oxlint** went from 0.48M to 15.3M weekly downloads in a year. Its JS plugin API is alpha and it has no CSS linting. The ESLint companion runs under Oxlint 1.85.0 unchanged (checked 2026-09-24).
- **Biome** now out-downloads Stylelint. Its only plugins are GritQL, which cannot load a token file, so it cannot host this rule.
- **@eslint/css** 2.0.0 (2026-09-01, about 406k weekly downloads) has no spacing or token rule. Any plugin can add rules for its CSS language. It is the one non-Stylelint host that works, and the route into ESLint's MCP server and GitHub Copilot code review, which runs CodeQL, ESLint and PMD.
- **Design tokens:** the format (DTCG 2025.10) is stable, with dimensions as `{ value, unit }` objects. Its group merged an official test suite on 2026-09-08. Figma's variables REST API is still Enterprise-only, so the file-based path, a committed DTCG export, is the one that works for everyone.
- **Agents:** AGENTS.md is in 60,000+ projects. Claude Code, Cursor, Codex and Copilot share hooks and skill files. Stylelint's maintainers declined an MCP server, and ESLint ships one.

## 4. The bet

Rhythmguard is **the scale ratchet for CSS, SCSS and Tailwind**. It measures drift against the scale a project already has, blocks new drift in CI, and fixes what can be fixed without moving layout. It is the only tool that restricts spacing to real steps, where Tailwind's canonical classes and @shadcn/lint accept any value.

Four rules follow from that:

1. **Ratchet first, cleanup second.** Defaults, docs and reports lead with the baseline and output-preserving fixes. Snapping is a decision a team makes with visual review.
2. **Complement, do not compete, on Tailwind class names.** @shadcn/lint and Tailwind own canonical class names. Rhythmguard owns the steps, the stylesheets and the baseline. Document running them side by side.
3. **Meet teams in the linter they already run.** Stylelint stays primary. ESLint through `@eslint/css` in Q1, and Oxlint through the ESLint companion now. No Biome work while its plugins cannot read tokens.
4. **Evidence before features, and before outreach.** Every default comes from the benchmark. Every agent claim comes from an eval edition. Every message to a maintainer leads with their own lines, and each draft is confirmed before it is posted.

## 5. 2026 Q4: the first command works, and the ratchet is the product

### Releases

| Release | Target | Contents |
| --- | --- | --- |
| Companion packages | first week of October | [#61](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/61) first manual publish of `rhythmguard` and `eslint-plugin-rhythmguard`, trusted publishing, `PUBLISH_COMPANIONS` |
| 3.9.0 | October | [#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163) DTCG 2025.10 object dimensions, [#159](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/159) hairlines in class strings, [#161](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/161) vendored and compiled CSS skipped by default, [#164](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/164) Node 24 and 26, ESLint 10 and Oxlint in CI and docs, [#165](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/165) `--format sarif`, [#170](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/170) running alongside @shadcn/lint |
| 3.10.0 | November to December | [#166](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/166) output-preserving fixes and `--preserve`, [#167](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/167) WordPress, GitLab and Wikimedia token discovery, [#168](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/168) weekly run against Stylelint's `v18` branch |

**The most important item is [#166](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/166).** Every finding says whether fixing it changes rendered output. Reports split "tokenise with no visual change" from "a decision that moves layout". `rhythmguard fix --preserve` does only the first. This is the answer to what USWDS and Bootstrap said, and it makes the tool usable on systems that will never re-snap old values.

### Distribution

1. **October, week 1.** Publish the companions ([#61](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/61)) and switch the README's first command back to `npx rhythmguard`. Send the reply to Materialize once it is confirmed.
2. **October.** Run and publish agent eval edition 1 ([#169](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/169)). It is the one artifact the Tailwind agent-lint conversation will quote, and the harness is built. Report a null result as plainly as a good one.
3. **October to November: the shared-config round** ([`docs/outreach/embed/`](./docs/outreach/embed/README.md)).
   - Primer first, since its maintainers already engaged and its token package is read.
   - Bootstrap's config after a decision under the no-follow-up rule.
   - WordPress, Wikimedia and GitLab after [#167](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/167) makes their consumers measurable against their own scales.
   - 10up last, if at all.
   - One draft at a time, each confirmed, and every outcome logged in [`embed-log.md`](./docs/outreach/embed-log.md).
4. **November.** Publish the State of Spacing 2026-09 article once the five own-scale rows without an audit issue are handled ([checklist](./docs/outreach/state-of-spacing-2026-09-submissions.md)). Then submit it to CSS Weekly, Frontend Focus, Smashing and JavaScript Weekly.
5. **December.** The State of Spacing 2026-12 edition ([#171](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/171)), with an output-preserving column and the change since September. File talk proposals as 2027 calls for papers open: CSS Day, Smashing Conf, Into Design Systems.

## 6. 2027 Q1: 4.0, the ESLint route, and the checkpoint

- **4.0.0** ([#172](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/172)). Target Q1, or the week Stylelint 18.0.0 ships if that forces it earlier.
  - Node floor 22.22. Stylelint 16, 17 and 18 all supported.
  - `fixWith: "token"` becomes the default, as promised in 3.6.0.
  - One default scale for the rules, the audit and the ESLint rule. Today the audit and the ESLint rule default to seven steps and the Stylelint rules to ten, so the editor and CI can disagree.
  - Findings carry structured metadata on the warning, so the audit no longer parses message text.
  - `docs/MIGRATING_TO_4.md`.
- **4.1: `use-scale` for `@eslint/css`** ([#173](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/173)). One `eslint.config.js` for plain CSS and class strings with the same scale. It reaches teams without Stylelint, ESLint's MCP server and Copilot code review. It shares fixtures with the Stylelint rule, and a contract test requires identical findings.
- **Enterprise basics** ([#174](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/174)).
  - Per-workspace scales in monorepos, verified on npm, pnpm and yarn workspaces.
  - A Windows run.
  - A no-network, no-telemetry statement in `SECURITY.md`.
- **Distribution.**
  - Follow through on any config-round replies.
  - Agent eval edition 2, adding the "tool call mid-task" condition that [#176](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/176) needs.
  - State of Spacing 2027-03.
  - Talks if accepted.
  - Invite a second maintainer from the people who have engaged. An enterprise reviewer weighs the bus factor more than any feature.
- **Checkpoint on 2027-03-31**, against the targets in section 8.

## 7. 2027 Q2: decisions on evidence

Three open questions each have a decision issue, the evidence gathered so far, and the rule for deciding. None is built unless its rule is met.

- **Less** ([#175](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/175)). Build it if at least two shared-config maintainers or Less-based teams ask after the config round. Taiga UI, Wikimedia and Arco write Less. `postcss-less` has had no release since 2022.
- **An MCP server** ([#176](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/176)). Build a thin server only if the eval shows a tool call mid-task beats findings after the fact by a margin worth maintaining. The field says brand and evals, not MCP, drove adoption.
- **Visual evidence for fixes that move layout** ([#177](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/177)). Build before-and-after screenshots for a PR only if a maintainer who declined a snap says evidence would change the answer. It would live outside the core package.

Otherwise Q2 continues what Q1 set: Stylelint 18 and Node 26 follow-ups, the State of Spacing 2027-06 edition, and whatever the checkpoint says.

## 8. Metrics and the checkpoint

| Metric | 2026-09-24 | Target 2026-12-31 | Target 2027-06-30 |
| --- | ---: | ---: | ---: |
| Shared configs that embed Rhythmguard | 0 | 1 | 3 |
| External repositories depending on it (GitHub code search, excluding own) | 2 | 6 | 20 |
| Issues or PRs in this repository from other people | 0 | 3 | 12 |
| Monthly downloads, all three packages | 3,910 | 8,000 | 20,000 |
| Unique repository visitors per fortnight | 20 | 80 | 250 |
| Stars | 5 | 40 | 150 |
| Published agent eval editions | 0 | 1 | 3 |
| Benchmark rows measured against their own scale | 23 of 58 | 30 | 40 |

**Checkpoint rule, 2027-03-31.** Continue at this pace if any one of these holds:

- a shared config embeds the rule;
- eight or more external repositories depend on it;
- monthly downloads pass 10,000 with the release spikes removed.

If none holds, Rhythmguard moves to maintenance: compatibility releases for Stylelint, ESLint and Node, security fixes, and the benchmark and State of Spacing editions. There is no new outreach and no new features. [`STRATEGY_2026-09.md`](./docs/STRATEGY_2026-09.md) section 7 calls that "a fine outcome". It should be reached on these numbers, not drifted into.

## 9. Not doing, and why

- **A hosted dashboard or paid tier.** Nobody sells spacing drift measurement, and the adjacent paid features sit behind enterprise contracts. For a larger organisation the path is a pilot run with the CLI and the Action, written up as a case study, not a product.
- **Biome or Oxlint-native CSS rules.** Neither can host a token-aware CSS rule today. Revisit when Biome ships JS plugins or Oxlint lints CSS.
- **Renaming the ESLint rules or splitting `packages/core`.** The re-export keeps one implementation, and `src/core` is already framework-free by test.
- **New property groups, scale presets, or motion features.** The spacing lane has no embedded adopter yet.
- **Competing on Tailwind class-name rules.** Canonical classes, variants and component rules belong to Tailwind and @shadcn/lint.
- **Re-contacting maintainers who did not reply.** The rule in the outreach log stands.

## 10. Risks

- **@shadcn/lint adds restricted spacing steps and a baseline.** Then the Tailwind side has a well-known competitor. Rhythmguard's CSS coverage, Sass and DTCG discovery, and output-preserving fixes remain; the side-by-side doc ([#170](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/170)) is written so it holds either way.
- **Stylelint 18 ships early with a change that breaks plugins.** Mitigated by the weekly run against the `v18` branch ([#168](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/168)).
- **The config round gets no yes.** The checkpoint handles that. The drafts ask for one warning-level rule and accept "no" as a complete answer.
- **One maintainer.** Mitigated only by a second maintainer. Everything else here assumes one person's time, so Q4 carries more than Q1 or Q2 on purpose.
- **Self-generated downloads hide the real signal.** Steer by dependents, embeds and external issues, not the download badge.

## Sources

Checked 2026-09-24 unless dated otherwise.

- Outreach record: [`docs/outreach/embed-log.md`](./docs/outreach/embed-log.md); USWDS [uswds/uswds#6900](https://github.com/uswds/uswds/issues/6900); Bootstrap [twbs/bootstrap#42907](https://github.com/twbs/bootstrap/issues/42907); Materialize [materializecss/materialize#665](https://github.com/materializecss/materialize/issues/665).
- @shadcn/lint: [repository](https://github.com/shadcn-ui/lint), [evals](https://github.com/shadcn-ui/lint/blob/main/docs/evals.md), issues [#19](https://github.com/shadcn-ui/lint/issues/19), [#44](https://github.com/shadcn-ui/lint/issues/44), [#49](https://github.com/shadcn-ui/lint/issues/49).
- Tailwind canonical candidates: [tailwindcss#19059](https://github.com/tailwindlabs/tailwindcss/pull/19059), [tailwindcss#19379](https://github.com/tailwindlabs/tailwindcss/pull/19379).
- Tailwind lint plugins: [eslint-plugin-tailwindcss#375](https://github.com/francoismassart/eslint-plugin-tailwindcss/issues/375) and [#483](https://github.com/francoismassart/eslint-plugin-tailwindcss/issues/483); [eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss).
- Deslint [pricing](https://deslint.com/pricing); [@lapidist/design-lint](https://github.com/bylapidist/design-lint).
- Stylelint 18: [stylelint#9338](https://github.com/stylelint/stylelint/issues/9338). Node schedule: [nodejs/Release](https://github.com/nodejs/Release/blob/main/schedule.json).
- Oxlint JS plugins: [alpha announcement](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha), [docs](https://oxc.rs/docs/guide/usage/linter/js-plugins); CSS request [oxc#26324](https://github.com/oxc-project/oxc/issues/26324).
- Biome: [plugins](https://biomejs.dev/linter/plugins/), [2026 roadmap](https://biomejs.dev/blog/roadmap-2026/).
- [@eslint/css](https://github.com/eslint/css). Copilot code review linters: [GitHub changelog, 2025-11-20](https://github.blog/changelog/2025-11-20-linter-integration-with-copilot-code-review-now-in-public-preview/).
- Design tokens: [DTCG first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/), [test-suite PR](https://github.com/design-tokens/community-group/pull/413), [Style Dictionary v5](https://styledictionary.com/versions/v5/migration/), [Figma variables REST API](https://developers.figma.com/docs/rest-api/variables-endpoints).
- SARIF upload to code scanning: [GitHub docs](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github). AGENTS.md: [agents.md](https://agents.md/).
- npm download figures: `api.npmjs.org`, windows of 2026-08-23 to 2026-09-21 (monthly) and 2026-09-15 to 2026-09-21 (weekly).
