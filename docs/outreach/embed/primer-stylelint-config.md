# Proposal: `rhythmguard/use-scale` at warning level in `@primer/stylelint-config`

Target: primer/stylelint-config (issue). Context the maintainers already have: primer/css#3166 and primer/react#8387, where they pointed at `--base-size-*` in `@primer/primitives` as the spacing ladder; the tool has read that package since 3.3.0.

---

Projects that extend `@primer/stylelint-config` get Primer's syntax and property rules but nothing about spacing values. Two consumers, audited 2026-09-23 on their default branches:

**evetv/mahogany** at `ec2402f`, 148 SCSS files. Its own layout variables in `src/support/variables/layout.scss` define an 8-based ladder (`0, 4, 8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128px`). 142 declarations are off it.

| File | Line | Declaration | Nearest steps |
| --- | ---: | --- | --- |
| `src/alerts/flash.scss` | 7 | `padding: 20px` | 16px or 24px |
| `src/alerts/flash.scss` | 18 | `margin-right: 12px` | 8px or 16px |
| `src/alerts/flash.scss` | 148 | `margin-bottom: 0.8em` | 8px or 16px |

Top values: `5px` ×22, `10px` ×14, `3px` ×13, `6px` ×12, `12px` ×10. Top properties: `padding` ×58, `margin` ×24, `margin-left` ×15.

**highjun/ARKA** (`packages/client`) at `0d73291`, 29 CSS files, no spacing tokens of its own: 4 declarations, three of them `gap: 2px` in `src/workbench/view/*.module.css`.

Primer's own ladder is what the rule reads when a consumer depends on `@primer/primitives` (`--base-size-4` through `--base-size-128`, from `dist/css/base/size/size.css`). Neither consumer above does, which is itself a finding for a shared config: they install Primer's lint rules without Primer's tokens.

## The proposal

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

`scale: "auto"` reads, in order: the project's `--space-*` / `--spacing-*` custom properties or Sass `$spacer*` variables, then installed token packages including `@primer/primitives`, then a default 4px scale announced once per file. A warning names the value and the two nearest steps. Zero, percentages and hairlines are exempt; nothing is rewritten without `--fix`; class strings and colors are out of scope.

One dependency, three transitive, Stylelint 16 or 17, Node 20.19. Warning severity fails no build. Per-file opt-out with `stylelint-disable rhythmguard/use-scale`; per project by setting the rule to `null`.

## What I am asking

Whether a PR adding the rule at warning level would be considered. If Primer's position is that the shared config should stay value-neutral, say so and I will not raise it again. Numbers reproduce with `npx stylelint-plugin-rhythmguard` in each checkout; the guide for config authors is https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
