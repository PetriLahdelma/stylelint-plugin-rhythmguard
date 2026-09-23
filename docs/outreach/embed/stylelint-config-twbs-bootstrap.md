# Proposal: one warning-level spacing rule for Bootstrap-derived projects, read from `$spacers`

Target: twbs/stylelint-config-twbs-bootstrap (issue). Consumers audited 2026-09-23 on their default branches.

---

Projects that extend `stylelint-config-twbs-bootstrap` inherit Bootstrap's spacing scale, the `$spacers` map (`0, .25rem, .5rem, 1rem, 1.5rem, 3rem`: 0, 4, 8, 16, 24, 48px). Their component SCSS steps off it in ways the config cannot see today. Three consumers, unedited:

**materialstyle/materialstyle** at `5d41f1e`, 99 SCSS files, scale read from its own `scss/_variables.scss` (the same `$spacers`): 33 declarations off it.

| File | Line | Declaration | Nearest steps |
| --- | ---: | --- | --- |
| `scss/_buttons.scss` | 132 | `padding: 6px` | 4px or 8px |
| `scss/forms/_form-check.scss` | 191 | `margin-top: .35em` | 4px or 8px |
| `scss/_reboot.scss` | 161 | `padding-left: 2rem` | 24px or 48px |

Top values: `2rem` ×9, `.75rem` ×3, `.15em` ×2. Top properties: `padding` ×17, `margin` ×4, `gap` ×4.

**MahdiMajidzadeh/bootstrap-v4-rtl** at `4c6c56b`, 92 SCSS files, same scale from `scss/_variables.scss`: 15 declarations off it.

| File | Line | Declaration | Nearest steps |
| --- | ---: | --- | --- |
| `scss/_carousel.scss` | 196 | `padding-top: 20px` | 16px or 24px |
| `scss/_carousel.scss` | 197 | `padding-bottom: 20px` | 16px or 24px |
| `scss/_custom-forms.scss` | 494 | `margin-right: 15px` | 8px or 16px |

**thomaspark/bootswatch** theme sources (`dist/*/_bootswatch.scss`, 54 files): 31 declarations that are not on `$spacers`, for example `brite/_bootswatch.scss:57` `margin: 3px` and `:61` `translateY(-3px)`. Bootswatch defines no scale of its own, so in the project the rule reads `$spacers` from the installed `bootstrap` package.

## The proposal

Add one rule to the config, at warning level:

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

`scale: "auto"` resolves the scale per project: the project's own `$spacer` / `$spacers` (or `--spacing-*` custom properties) first, then the installed `bootstrap` package's `scss/_variables.scss`. A Bootstrap-derived project therefore gets Bootstrap's scale without configuring anything, and a project that overrides `$spacers` gets its own. A consumer with neither is told, once per file, that a default 4px scale is in use.

What consumers see: a warning on a spacing declaration (`margin`, `padding`, `gap`, `inset`, translations) whose literal length is not on the scale, naming the two nearest steps. Zero, percentages and hairlines of one pixel or less are exempt. Nothing is rewritten unless someone runs `--fix`. Colors, Sass expressions that do not resolve, and class strings are out of scope.

What it costs: one dependency (`stylelint-plugin-rhythmguard`, three runtime dependencies of its own, Stylelint 16 or 17, Node 20.19). Warning severity means no build fails when the config updates. Consumers opt out per file with `stylelint-disable rhythmguard/use-scale` or per project by setting the rule to `null`.

## What I am asking

Whether you would take a PR adding the rule at warning level. If the answer is that a config this widely installed should not carry a spacing opinion, that is a fair answer and I will not ask again. If the findings above are wrong for these projects, tell me which; false positives change the tool's defaults.

The numbers reproduce with `npx stylelint-plugin-rhythmguard` in a checkout of each project. I maintain the rule; the method and the 58-repository benchmark it is tuned on are public: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
