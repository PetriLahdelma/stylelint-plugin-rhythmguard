# Proposal: a spacing rule in `@10up/stylelint-config`

Target: 10up/10up-toolkit, `packages/stylelint-config` (issue). Low priority: the independent consumers found are small and last pushed in 2023 to 2025. The config already ships `stylelint-declaration-strict-value`, which is the closest cultural fit on the list.

---

**ouun/zammad-wp** at `2854267`, 14 stylesheets: 15 declarations off a 4px grid.

| File | Line | Declaration | Nearest steps |
| --- | ---: | --- | --- |
| `assets/css/shared/chat.scss` | 57 | `margin-right: 5px` | 4px or 8px |
| `assets/css/shared/chat.scss` | 140 | `margin-right: 0.6em` | 8px or 12px |
| `assets/css/shared/chat.scss` | 155 | `padding: 0.7em` | 8px or 12px |

**amalter/altstarter** at `cfb3fa5`, 35 stylesheets: 0.

## The proposal

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

`scale: "auto"` reads the project's own spacing tokens or an installed token package, then a default announced once per file. Warning severity, two nearest steps in the message, zero, percentages and hairlines exempt, nothing rewritten without `--fix`. It sits next to `declaration-strict-value`: that rule asks for a variable, this one asks the number to be on the scale.

## What I am asking

Whether a PR adding the rule at warning level would be considered. Guide: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
