---
title: We audited 20 design systems for spacing drift. Here is what teams can use from it.
published: false
tags: css, designsystem, tailwindcss, webdev
canonical_url: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/QUIET_BENCHMARK.md
---

**Nobody on your team chose 13px.** Someone pasted it. Someone nudged 12px until a border lined up. A coding agent produced it because nothing told it your scale stops at 12 and 16.

```css
.card {
  padding: 13px;        /* off-scale: nearest are 12px or 16px */
  margin-bottom: 7px;   /* off-scale: nearest are 4px or 8px */
}
```

Six months later `git grep` finds forty distinct spacing values, and the design system's spacing page describes a project that no longer exists.

This spring I pointed [Rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), the Stylelint plugin I maintain for spacing scales, at twenty public design systems to find out how quiet it could be on code I do not control. The numbers changed the tool more than any feature request has. This is what a team can take from them, whether or not you use this plugin.

---

## Part 1. What twenty repositories showed

The benchmark clones each repository at a pinned commit, runs the audit, and classifies every finding as real drift or as noise the tool should not have raised. The full table lives in [`QUIET_BENCHMARK.md`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/QUIET_BENCHMARK.md) and CI regenerates it on every change. A slice:

| Repo | Off-scale findings | Scale source | Note |
| --- | ---: | --- | --- |
| [Mastodon](https://github.com/mastodon/mastodon) | 564 | its own `--space-*` tokens | see below |
| [Carbon](https://github.com/carbon-design-system/carbon) | 272 | fallback | spacing goes through `spacing()` |
| [Primer CSS](https://github.com/primer/css) | 97 | fallback | tokens arrive from a package |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 58 | its own Tailwind `--spacing` base | |
| [Bootstrap](https://github.com/twbs/bootstrap) | 41 | fallback | spacing goes through `$spacer` |
| [Mantine](https://github.com/mantinedev/mantine) | 30 | its own `--mantine-spacing-*` tokens | |
| [Radix Themes](https://github.com/radix-ui/themes) | 7 | its own `--space-*` tokens | values written as `calc(4px * var(--scaling))` |
| [Spectrum CSS](https://github.com/adobe/spectrum-css) | 5 | fallback | everything is a `--spectrum-*` token |

Three things held across the set.

### Drift concentrates in a handful of values

Mastodon defines a real spacing scale as custom properties:

```scss
// app/javascript/styles/mastodon/tokens/_shape.scss
--space-3xs: 2px;
--space-xs: 8px;
--space-sm: 12px;
--space-md: 16px;
--space-lg: 20px;
--space-xl: 24px;
--space-4xl: 36px;
--space-5xl: 40px;
```

Its stylesheets ignore that scale 564 times. Here is the audit's own histogram:

```
## CSS Off-Scale Values

| Value  | Count |
| ------ | ----: |
| `10px` |   165 |
| `15px` |   112 |
| `5px`  |    70 |
| `30px` |    50 |
| `6px`  |    36 |
```

Three values explain two thirds of the drift. Each one is a single design decision.

> Is `10px` a step you want, a mistake you want fixed, or a token you forgot to define? That is one conversation, not 165 code reviews.

When you audit your own codebase, expect the same shape. Fix the top three values and you have fixed most of the problem.

### Sass-routed spacing is invisible to a CSS-level check

Bootstrap's `$spacer`, USWDS's `units()`, Carbon's `spacing()` and Lightning's `$spacing-*` never appear as literal lengths before compilation:

```scss
// Carbon: the linter sees a function call, not a length
padding: spacing(5);

// Bootstrap: the linter sees a variable, not a length
margin-bottom: $spacer * 1.5;
```

Those repositories report few findings, and the audit falls back to a default scale because it cannot find their tokens. **A clean report on a Sass-heavy codebase means the tool could not see your scale.** It does not mean your spacing is consistent. Check which one you are looking at before you celebrate.

### Two kinds of finding were wrong everywhere, and each was a reason to switch the rule off

The tool reported percentage translations as raw values in need of a token:

```css
.dialog { transform: translate(-50%, -50%); }   /* reported. Wrong. */
```

And it reported one-pixel offsets as off-scale:

```css
.tab + .tab { margin-inline-start: -1px; }      /* border overlap. Reported. Wrong. */
.button:focus-visible { outline-offset: 1px; }  /* focus ring. Reported. Wrong. */
.icon { transform: translateY(1px); }            /* subpixel fix. Reported. Wrong. */
```

In Primer React those hairlines were **46% of all findings**. No maintainer accepts either class.

> A rule that is switched off enforces nothing. Every false positive is a vote to switch it off.

---

## Part 2. What changed, from your side of the table

Every change below exists because the benchmark forced it. I describe them as what your team gets, because that is the only reason they matter.

### One command, before anyone configures anything

```bash
npx rhythmguard
```

No install, no config. This is the real output on the Mastodon checkout:

```
  Detected
    Tailwind        no
    Next.js         no
    Stylelint config none
    Token files     none found

  Scale
    Scale           0, 2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40
    Source          scanned-css (app/javascript/styles/mastodon/components.scss, …/tokens/_shape.scss)

  Findings
    CSS files       36
    Off-scale       564 in CSS, 0 in class strings
    Cleanliness     53%
    Top values      10px ×165, 15px ×112, 5px ×70, 30px ×50, 6px ×36
    Top files       components.scss (973), admin.scss (325), forms.scss (203)

  Paste this into .stylelintrc.json:

    {
      "extends": ["stylelint-plugin-rhythmguard/configs/recommended"],
      "rules": {
        "rhythmguard/use-scale": [true, { "scale": "auto" }]
      }
    }
```

Run it in a planning meeting. The output is the agenda.

### The scale comes from your tokens, and the tool tells you where it found them

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto" }]
  }
}
```

With `"auto"` the rule reads your `--space-*` or `--spacing-*` custom properties, a Tailwind v4 `--spacing` base, values written as `calc(4px * var(--scaling))` the way Radix does it, or a token file you point at with `scaleSources`. Nobody types the scale into a config and forgets to update it when the tokens change.

If it finds fewer than three token values it refuses to trust them and falls back to a 4px preset, saying so in the first message:

```
Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px).
No spacing tokens were found for scale "auto"; using preset "rhythmic-4". (rhythmguard/use-scale)
```

### Quiet by default, loud on request

Percentages are never findings. Hairlines of one CSS pixel or less are exempt through `allowHairlines`. If your team renders hairlines through a token and wants them caught:

```json
{ "rhythmguard/use-scale": [true, { "scale": "auto", "allowHairlines": false }] }
```

After those two changes the heuristic false-positive rate across all twenty repositories is **0%**. What remains is the list a maintainer would want to read. The reasoning is written up in the [rule docs](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/use-scale.md#hairlines), because a default without a written reason is a default someone will rightly question.

### A one-line entry point for platform teams

If you publish a shared Stylelint config that other teams install:

```json
{ "extends": ["stylelint-plugin-rhythmguard/configs/embed"] }
```

One rule, warning level, scale inferred per consumer, no other dependencies, shape frozen for the 2.x line. Your consumers see spacing warnings in their editor against **their** scale without you knowing what that scale is. The [guide for config authors](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md) covers the case where tokens live in an npm package rather than in CSS.

### SCSS is in scope

```bash
npm install --save-dev postcss-scss
```

The audit then reads `.scss` files too. It still does not evaluate Sass variables, so read the Carbon example again before trusting a clean report.

### Agents get instructions, not vibes

The fastest source of off-scale values in 2026 is the coding agent that wrote the component. Paste this into `AGENTS.md`:

```md
- Before finishing any change to CSS or Tailwind class strings, run
  `npx rhythmguard audit . --format json` and fix every `off-scale` finding.
- A finding names the value and the two nearest on-scale values. Use the token
  for that value when one exists; otherwise the nearest on-scale value.
  Never invent a new spacing value.
- Do not `--fix` spacing findings unless asked. Snapping changes layout.
- If the scale source is `fallback`, the project has no discoverable tokens.
  Ask before adding any.
```

The [full block](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_AGENTS.md) is short on purpose. An agent instruction is only useful while it is short and true.

---

## Part 3. Rolling it out without a fight

The one team I could find that adopted this in production described the same sequence independently in their own issue tracker. It works.

1. **Audit first, enforce later.** `npx rhythmguard audit ./src --format markdown` gives you a report to put in front of the design-system owner. Decide together which of the top values are real decisions.
2. **Baseline the past, gate the future.**
   ```bash
   npx rhythmguard audit ./src --write-baseline
   npx rhythmguard audit ./src --since-baseline --fail-on-new-drift   # in CI
   ```
   The legacy 564 block nobody. The 565th does.
3. **Warning level for a quarter.** Warnings show in editors and as PR annotations with `--format github`. No build fails.
4. **Autofix stays off for spacing** until you have looked at the visual result. Snapping 13px to 12px moves things.
5. **Ignore generated and vendored CSS** in the config. The rule cannot tell authored from generated, and one generated file buries the report.

---

## What it will not do for you

- It does not check colors.
- The Stylelint rules do not see Tailwind class strings. That is a separate ESLint rule in the same package.
- It does not evaluate Sass variables or functions.
- If your tokens live in an npm package, point `scaleSources` at the built token file or inference falls back.

If you expect any of these and do not get them, the tool has not failed. It was never in scope.

## Check the numbers yourself

The benchmark, its manifest and its snapshots are in the repository under [`benchmarks/quiet/`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/tree/main/benchmarks/quiet). CI reruns it on every change and fails if the findings on any pinned repository move, so the figures above are not a one-off.

If the tool reports something on your codebase that your team considers wrong, that is exactly the kind of finding the benchmark exists to catch. [A reproduction in an issue](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues) is enough.
