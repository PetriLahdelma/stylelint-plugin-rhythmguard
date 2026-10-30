# Draft: doctor-school/ds-platform, the `spacingScalePx` glue and the 3.6.0 pin

Status: posted 2026-10-30 as [doctor-school/ds-platform#3591](https://github.com/doctor-school/ds-platform/issues/3591), body as below (the "last updated 2026-10-07" aside dropped). Citations re-checked against `30bad64` before posting: the token files and both lint configs are unchanged since `4811a17`. Researched 2026-10-30 against `doctor-school/ds-platform` at [`4811a17`](https://github.com/doctor-school/ds-platform/commit/4811a1729adb686931e3e8dcbf333d350952810b). Council plan item 5 ([`docs/COUNCIL_2027-2028.md`](../../COUNCIL_2027-2028.md)). They were never contacted, so this does not break the no-follow-up rule.

## Channel

A new issue in doctor-school/ds-platform, opened as a blank issue with no labels.

- Issues are enabled, Discussions are disabled.
- Blank issues are accepted: `.github/ISSUE_TEMPLATE/` holds four Markdown templates (`bug.md`, `chore.md`, `default.md`, `feature.md`) and no `config.yml`, and the organisation has no `.github` repository, so GitHub's default (blank issues on) applies. The templates are not forms.
- The templates are for their own workflow: each asks for a `source:*` label and a `Reuse:` line, and `feature.md` for an EARS reference. An outsider cannot set labels, and none of those fields fit, so a blank issue is the honest form.
- There is no other public contact. The organisation and the one human contributor (`sidorovanthon`, 1,644 commits; the rest are bots) list no email or site.
- The repository is run with coding agents (`AGENTS.md` line 113: code-level work is tracked in GitHub Issues here). No one outside the owner and bots has ever opened an issue there (search total: 0). An agent may read this issue during triage, so the body asks two questions, asks for no change, and names the owner so a person sees it.

## Title

```
Lint scale: read tokens/*.json directly instead of spacingScalePx? (and the rhythmguard 3.6.0 pin)
```

## Body

````markdown
@sidorovanthon, two questions about the spacing gate from #234.

`packages/design-system/style-dictionary.config.mjs:377-400` derives `spacingScalePx` from the `space.*` values and writes it into `allowed-tokens.json` (line 438). `stylelint.config.mjs:24-32` reads it back for `scale` (line 52), and `eslint.config.js:42-51` does the same for `tailwind-class-use-scale` (line 240).

I ran the plugin locally on copies of `tokens/primitive.json` and `tokens/semantic.json` at 4811a17. With these `use-scale` options the rule reads the same 17 steps, 0 to 64px, with `space.chip-x` as the 22px step:

```js
scale: "auto",
scaleSources: [
  "packages/design-system/tokens/primitive.json",
  "packages/design-system/tokens/semantic.json",
],
```

Your 13 linted CSS files give 0 warnings with either config, on 3.6.0 and on 3.14.0. The ESLint rule only takes an array, so that half still needs `spacingScalePx`.

1. `pnpm-lock.yaml:78` resolves 3.6.0, and #1460, last updated 2026-10-07, lists the 3.8.0 bump under "Awaiting Schedule". Is anything blocking an upgrade besides the schedule?
2. If the ESLint rule read the same two files, could you delete `spacingScalePx` and both readers? If not, what else needs it?

I maintain stylelint-plugin-rhythmguard, which you added in #242.
````

About 155 words outside the code block.

## Evidence, verified 2026-10-30

Their code, at `4811a17`:

- Dependency: [`package.json:153`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/package.json#L153) `"stylelint-plugin-rhythmguard": "^3.6.0"`, raised from `^2.0.1` in [#2114](https://github.com/doctor-school/ds-platform/pull/2114) on 2026-09-09, the day after 3.6.0 was published.
- Lockfile: [`pnpm-lock.yaml:76-78`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/pnpm-lock.yaml#L76-L78) resolves `3.6.0` (also line 7465). The caret already allows 3.14.0; only the lockfile pins it.
- Renovate: the Dependency Dashboard [#1460](https://github.com/doctor-school/ds-platform/issues/1460) lists `chore(deps): update dependency stylelint-plugin-rhythmguard to v3.8.0` under "Awaiting Schedule". The issue was last updated 2026-10-07, so it has not seen 3.9.0 (2026-10-14) or later. `renovate.json` holds only `ignorePaths`; the schedule comes from elsewhere.
- Token source: DTCG files read by Style Dictionary with `usesDtcg: true` ([`style-dictionary.config.mjs:1-40`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/style-dictionary.config.mjs#L1-L40)). Spacing is `space` in [`tokens/primitive.json:251`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/tokens/primitive.json#L251) (16 steps: 15 rem strings and `px: 1px`) and the semantic roles in [`tokens/semantic.json:247`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/tokens/semantic.json#L247) (mostly `{space.N}` aliases into the other file; `chip-x` is `1.375rem` at line 290; `gutter` and `panel` are `clamp()`). Values are the string form (`"0.25rem"`), not 2025.10 `{ value, unit }` objects.
- The glue: [`style-dictionary.config.mjs:377-400`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/style-dictionary.config.mjs#L377-L400) converts every `space.*` leaf (rem times 16, px, `0`; anything else dropped) into a sorted unique list, emitted as `spacingScalePx` at [line 438](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/style-dictionary.config.mjs#L438). Generated value at [`allowed-tokens.json:663-681`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/packages/design-system/src/styles/allowed-tokens.json#L663-L681): `0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 22, 24, 28, 32, 40, 48, 64`.
- Readers: [`stylelint.config.mjs:24-32`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/stylelint.config.mjs#L24-L32) and [line 52](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/stylelint.config.mjs#L52) (`use-scale`, explicit `properties` list, no severity, so it fails the build); [`eslint.config.js:42-51`](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/eslint.config.js#L42-L51) and [lines 238-241](https://github.com/doctor-school/ds-platform/blob/4811a1729adb686931e3e8dcbf333d350952810b/eslint.config.js#L238-L241) (`rhythmguard-tailwind/tailwind-class-use-scale` at `"error"`, imported from `stylelint-plugin-rhythmguard/eslint` at line 23).
- The gate came from their issue [#234](https://github.com/doctor-school/ds-platform/issues/234) and PR [#242](https://github.com/doctor-school/ds-platform/pull/242) (2026-06-17); the per-step `--spacing-N` keys were dropped in [#294](https://github.com/doctor-school/ds-platform/pull/294), which is why the derivation reads values, not names.
- Stylelint scope: `lint:stylelint` at `package.json:83` globs `apps/**/*.css` and `packages/**/*.css`: 14 files, 13 after `tokens.css` is ignored.

Run locally (scratch directory, their files downloaded as text through `gh api`, none of their code executed; Rhythmguard and Stylelint 17.15.0 installed from registry.npmjs.org):

| Config | Rhythmguard | Inferred scale (px) | Their 13 CSS files |
| --- | --- | --- | --- |
| Explicit `spacingScalePx` (today) | 3.6.0 and 3.14.0 | 0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 22, 24, 28, 32, 40, 48, 64 | 0 warnings |
| `scale: "auto"`, `scaleSources` = `primitive.json` + `semantic.json` | 3.6.0 and 3.14.0 | identical | 0 warnings |
| `scale: "auto"`, `scaleSources` = generated `tokens.css` | 3.6.0 and 3.14.0 | identical | 0 warnings |
| `scale: "auto"`, `.rhythmguardrc.json` `audit.tokenSources` = the two JSON files | 3.14.0 | identical | not run |
| `scale: "auto"`, `primitive.json` only | 3.6.0 and 3.14.0 | same minus 22 | not run |
| `scale: "auto"`, `semantic.json` only | 3.6.0 and 3.14.0 | falls back to `rhythmic-4` (aliases point into the other file) | not run |

Method: a probe stylesheet with `padding: 0px` to `80px`, linted with their `properties` list; the passing values are the scale. `parseTokenSources` on the two JSON files reads them as `dtcg` (16 and 12 tokens, no warnings); on `tokens.css`, `css` (41 tokens, no warnings). Both files must be listed: `semantic.json` alone does not resolve `{space.N}`.

What this means for the pitch:

- The Stylelint half of the glue could have been `scaleSources` on 3.6.0 already. The upgrade is not a precondition for deleting it, and the message does not claim it is.
- The ESLint half cannot go today. `tailwind-class-use-scale` accepts only a `scale` array (`src/eslint/rules/tailwind-class-use-scale.js`, schema), with no `"auto"` and no `scaleSources`. Adding that is a new rule option, which the freeze in `CONTRIBUTING.md` holds until 4.0. A yes to question 2 is the named-user request the council plan asks for (2027 Q2: "so a doctor-school-style team can delete its glue").
- The council's line that "a DTCG export silently falls back" does not apply to their files: string-valued DTCG with `{alias}` references is read correctly by both versions. It applied to `{ value, unit }` objects, fixed in 3.9.0 and 3.14.0.

## Not verified

- Whether anything else in their repository reads `spacingScalePx`. GitHub code search does not index ds-platform (a search for `allowed-tokens` returns nothing). I read both lint configs, the token build, `tokens.test.ts` and the showcase `tokens` and `rhythm` pages; none other reads it. `allowed-tokens.json` itself has other consumers (breakpoints, references, descriptions), so only the `spacingScalePx` field would go.
- How 3.14.0 changes their ESLint class-string findings. Their TSX was not linted. The 3.13.0 changes to `tailwind-class-use-scale` (double negatives, `meta.type`) and the unreleased hairline exemption (#159) could move a finding.
- Why Renovate stopped: the dashboard has not refreshed since 2026-10-07; whether the schedule, a config change or the app being off is the cause is unknown.
- That the 3.6.0 download stream (534 of 862 in one week, council report) is their CI. Consistent, not proven; not mentioned in the message.
- How their agent workflow treats an issue from an outsider. The body is written so that an agent reading it has nothing to execute.
