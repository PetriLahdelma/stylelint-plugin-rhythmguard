# Draft: primer/stylelint-config, refreshed 2026-10-30

Status: posted 2026-10-30 as [primer/stylelint-config#782](https://github.com/primer/stylelint-config/issues/782), the `gap` and `inset` observation only (title "primer/spacing: gap and inset are not checked"). The second observation and the README question were not sent: the council plan stops cold outreach that mentions the tool. Replaces the ask in [`../embed/primer-stylelint-config.md`](../embed/primer-stylelint-config.md) (2026-09-23), which should not be sent as written: its central claim is wrong. Checked against `primer/stylelint-config` `main` at [`4e94c60`](https://github.com/primer/stylelint-config/commit/4e94c602795f04c77568f07dfb0330f690b48af8) (2026-10-21), `@primer/stylelint-config` 13.6.0 and `@primer/primitives` 11.10.0.

## What changed from the September draft

| September claim | State on 2026-10-30 |
| --- | --- |
| Consumers "get Primer's syntax and property rules but nothing about spacing values" | False, and was false in September. `primer/spacing` is enabled in `index.js:101` at error severity and has existed since 9.0.0. It rejects every `px`, `rem` and `em` literal on `padding*`, `margin*`, `top`, `right`, `bottom` and `left`, and every custom property that is not a Primer variable. It is stricter than `rhythmguard/use-scale`, not absent. |
| evetv/mahogany: 142 declarations off its own scale | A 2021 fork of primer/css ("Eve's Custom Fork of GitHub's Primer CSS Framework"); last commit `ec2402f` on 2021-12-28. It does depend on `@primer/primitives` (`^7.4.0`), which the draft denied, and extends `@primer/stylelint-config` 12.2.0 with `primer/spacing` on. Not a useful example. |
| highjun/ARKA: 4 declarations | The repository returns 404. |
| Ladder `--base-size-4` to `--base-size-128` | 11.10.0 ships 19 steps, `--base-size-2` to `--base-size-128` (2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 64, 80, 96, 112, 128px) plus `--base-size-negative-*`. Rhythmguard 3.14.0 reads exactly the 19 positive steps plus 0 (pattern `^--base-size-\d+$`), verified below. |
| Ask: add `rhythmguard/use-scale` at warning level to the shared config | Dropped. Adding a second, looser spacing rule beside `primer/spacing` would report the same declarations twice for every Primer consumer. |

## Channel

A new issue in primer/stylelint-config, blank.

- Active: pushed 2026-10-30; npm `latest` 13.6.0, and a canary was published on 2026-10-30. But since 2026-05-04 (Lukas Oppermann, [#677](https://github.com/primer/stylelint-config/pull/677)) every commit is Dependabot. CODEOWNERS is `@primer/engineer-reviewers`.
- Issues on, Discussions off. No `.github/ISSUE_TEMPLATE` in the repository, and the `primer/.github` organisation repository has none either, so a blank issue is the only form.
- Outside issues do get answers, slowly: [#437](https://github.com/primer/stylelint-config/issues/437) (`unset` as a spacing value) was answered and closed; [#578](https://github.com/primer/stylelint-config/issues/578) got a reply in three days; [#524](https://github.com/primer/stylelint-config/issues/524) has been open with no reply since 2024-11-12. 6 open issues.
- Primer's maintainers already know the tool from [primer/css#3166](https://github.com/primer/css/issues/3166) and [primer/react#8387](https://github.com/primer/react/issues/8387) (September audits, both closed after one exchange with liuliu-dev). The body does not repeat those and does not need to cite them.

## Title

```
primer/spacing: gap and inset are not checked, and projects with their own scale turn the rule off
```

## Body

```markdown
Two observations about `plugins/spacing.js` at 4e94c60, and one question.

1. `propList` (line 23) is `padding, margin, top, right, bottom, left`, matched with `startsWith` (line 62). So `gap`, `row-gap`, `column-gap` and `inset*` are never checked: `gap: 13px` passes, and `__tests__/spacing.js` has no case for them. Is that intended? If not, I can send a PR adding them with tests; `var(--stack-gap-normal)` would still pass, since functional size tokens are allowed.

2. The rule rejects any custom property that is not Primer's (`var(--my-space)`, test at line 239). Of the four public projects outside the primer and github organisations that I found extending this config, three set `primer/spacing` to `null`. zk-phi/MEGAMOJI does it at [`stylelint.config.js:41`](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/stylelint.config.js#L39-L44), "stop forcing to use primer/css vars", although its five tokens ([`App.vue:244-248`](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/src/components/App.vue#L244-L248): 4, 6, 8, 16 and 28px) are all `--base-size-*` steps. With the rule off, `padding: 3px 6px` at [`Reaction.vue:21`](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/src/components/emoji/Reaction.vue#L21) goes unseen.

For projects like that, would a README note pointing at a warning-level rule that checks values against the project's own scale be welcome? The one I have in mind is `rhythmguard/use-scale`, which I maintain. "No" is a complete answer.
```

About 180 words.

## Evidence, verified 2026-10-30

Their code (`main` at `4e94c60`):

- [`index.js:101`](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/index.js#L101) `'primer/spacing': true`, alongside `primer/borders`, `box-shadow`, `colors`, `responsive-widths`, `typography`, `no-display-colors` (lines 97 to 103). README line 34: "Enforces the use of spacing variables for margin and padding."
- [`plugins/spacing.js:23`](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/plugins/spacing.js#L23) `const propList = ['padding', 'margin', 'top', 'right', 'bottom', 'left']`; [line 62](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/plugins/spacing.js#L62) `if (!propList.some(spacingProp => prop.startsWith(spacingProp))) return`. No other plugin in `plugins/` or `index.js` mentions `gap` or `inset` (grep). An issue search for `gap` in the repository finds only Dependabot titles.
- [`plugins/spacing.js:29-30`](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/plugins/spacing.js#L29-L30): the ladder is `base/size/size.json` from `@primer/primitives`; allowed variables add `functional/size/size.json` (`plugins/lib/utils.js:10-15`), which holds `--stack-gap-condensed|normal|spacious` and `--stack-padding-*` in 11.10.0.
- [`__tests__/spacing.js:238-245`](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/__tests__/spacing.js#L238-L245): `.x { padding: var(--my-space); }` is rejected ("Errors on non-primer spacer").
- Not in the body, but relevant to the ratchet argument: `plugins/spacing.js:39-47` adds `px + 1` and `px - 1` to every size except 2 and 6 as replacement candidates, so `--fix` turns `3px` and `5px` into `var(--base-size-4)` and `7px` into `var(--base-size-8)` ([`__tests__/spacing.js:88-89`](https://github.com/primer/stylelint-config/blob/4e94c602795f04c77568f07dfb0330f690b48af8/__tests__/spacing.js#L88-L89)). Those fixes move layout by 1px.
- `package.json`: version 13.6.0, `stylelint` `^16.20.0` dev, peer `@primer/primitives` `10.x || 11.x`, dev `^11.5.0`. npm: `@primer/stylelint-config` 13.6.0 latest, 4,891 downloads in the week to 2026-10-28; `@primer/primitives` 11.10.0, 139,588.

Consumers (GitHub code search for `"@primer/stylelint-config"` and `"primer/spacing"`, excluding the primer and github organisations):

| Repository | Extends the config | `primer/spacing` | Notes |
| --- | --- | --- | --- |
| [zk-phi/MEGAMOJI](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/stylelint.config.js#L39-L44) (363 stars, last commit 2026-10-22) | yes, 12.x | `null` at line 41, with `box-shadow`, `borders`, `typography`, `colors` | Own tokens [`App.vue:244-248`](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/src/components/App.vue#L244-L248) `--spacingSmall` 0.25rem, `--spacingInlineSmall` 0.375rem, `--spacingMedium` 0.5rem, `--spacingLarge` 1rem, `--spacingXLarge` 1.75rem; 13 `padding`, `margin` and `right` declarations use them, each of which `primer/spacing` 13.6.0 rejects, going by its tests. Depends on `@primer/css` 20.x, not `@primer/primitives`. |
| FineArchs/MFM-MOJI | yes | `null` | Same config as MEGAMOJI (a derivative); not cited separately. |
| getselfstudy/firebase-sdk-jest-test | yes | `null` | Test repository, last push 2022-07-09. |
| evetv/mahogany | yes, 12.2.0 | on | 2021 fork of primer/css. |
| transmission/transmission `web/` | no | n/a | Lists `@primer/stylelint-config` `^13.4.0` in `web/package.json:22` but `web/stylelint.config.js` extends only `stylelint-config-sass-guidelines`. Not a consumer. |

MEGAMOJI measured locally (65 `.vue` and `.css` files at `66e15ff`, downloaded as text; Rhythmguard 3.14.0 with `postcss-html`):

- Against Primer's ladder with `primer/spacing`'s own property list: 1 finding, [`src/components/emoji/Reaction.vue:21`](https://github.com/zk-phi/MEGAMOJI/blob/66e15ff40ae068989dbec49a050ec6e0e55ef8ab/src/components/emoji/Reaction.vue#L21) `padding: 3px 6px` (3px, nearest 2px or 4px). The same with Rhythmguard's default property list. Only three `padding` or `margin` declarations in the project use length literals at all (`Preview.vue:57` 12px, `Reaction.vue:21`, `Reaction.vue:22` 2px).
- Its 7 `gap` declarations all use its own `--spacing*` variables.

Rhythmguard reads Primer's ladder (scratch project depending on `@primer/primitives` 11.10.0, `scale: "auto"`, Rhythmguard 3.14.0): passing values are exactly 0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 64, 80, 96, 112, 128 (1px passes as a hairline). `gap: 13px` and `inset: 13px` are reported with nearest 12px or 16px. `@primer/primitives` is in `src/core/token-packages.json` with `dist/css/base/size/size.css` and `^--base-size-\d+$`.

## Not verified

- `primer/spacing` was read, not run. The `gap` claim rests on lines 23 and 62 and on the tests; it was not executed against 13.6.0.
- Whether skipping `gap` and `inset` is deliberate. Nothing in the changelog, README or issues says either way; question 1 asks.
- Whether a PR adding `gap` would be accepted: at error severity it adds failures for every consumer that writes a literal gap, which Primer may treat as breaking. If they say yes, offer it behind a minor and with Primer's own repos checked first.
- Consumer coverage. Code search finds four outside projects; GitHub's own consumers (primer/react, primer/css, github.com) cannot be checked from outside except the two public repos.
- Who would answer: the last human commit is 2026-05-04. A reply may take weeks or not come.

## Open questions for Petri

1. The ask has changed. The September draft asked Primer to embed the rule; this one asks whether `gap`/`inset` are skipped on purpose and whether a README note for opted-out consumers is welcome. Is that still worth sending, given the council's split on the config round (`docs/COUNCIL_2027-2028.md`, "Outreach")?
2. Question 1 is a contribution to their rule, not a Rhythmguard pitch. Send it even if the README note is unwelcome? It could also go alone, with the README question dropped.
3. MEGAMOJI's one off-ladder value is 1px from a step. It shows the gap (nothing checks it) more than the size of the problem. Keep it, or lead with the 13 declarations `primer/spacing` would reject?
4. `embed/README.md` row 2 still says the Primer precondition is "None" and cites mahogany and ARKA. Update it in the same PR as this draft, or once the message is confirmed?
