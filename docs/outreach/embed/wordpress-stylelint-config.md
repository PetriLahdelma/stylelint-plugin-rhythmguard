# Proposal: a spacing rule in `@wordpress/stylelint-config`, once the tool reads `$grid-unit-*`

Target: WordPress/gutenberg, `packages/stylelint-config` (issue). Precondition before posting: scale inference must read WordPress's `$grid-unit-05` to `$grid-unit-80` (`packages/base-styles/_variables.scss`); today the consumers below are measured against a default 4px scale, which is not a claim about WordPress. Also a re-contact: WordPress/gutenberg#82502 (the components audit) has no reply.

---

WordPress defines its spacing in `$grid-unit-*` (multiples of 8px, with `$grid-unit-05` at 4px). Plugins that extend `@wordpress/stylelint-config` write spacing by hand. Two of them, audited 2026-09-23:

**nk-crew/ghostkit** at `def92c5`, 170 SCSS files: 199 declarations off the 4px grid.

| File | Line | Declaration | Nearest grid steps |
| --- | ---: | --- | --- |
| `assets/admin/css/admin.scss` | 52 | `margin-top: 10px` | 8px or 12px |
| `assets/admin/css/admin.scss` | 70 | `padding-top: 14px` | 12px or 16px |
| `assets/admin/css/admin.scss` | 83 | `padding: 6px` | 4px or 8px |

Top values: `10px` ×40, `15px` ×31, `20px` ×18, `5px` ×14. Top properties: `padding` ×51, `margin-bottom` ×31, `margin-top` ×28.

**Strategy11/formidable-forms** at `8b333b7`, 267 SCSS and 28 CSS files: 1,062 declarations, led by `10px` ×245, `5px` ×161, `20px` ×118. `css/admin/animations.css` alone translates by `7px`, `15px` and `10px` (lines 69, 82, 123).

## The proposal

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

With `$grid-unit-*` inference in place, `scale: "auto"` gives every consumer of the config WordPress's own grid, read from `@wordpress/base-styles` when installed, and a plugin that defines its own `--space-*` tokens gets those instead. A warning names the value and the two nearest steps; zero, percentages and hairlines are exempt; nothing is rewritten without `--fix`.

One dependency, three transitive, Stylelint 16 or 17, Node 20.19. Warning severity fails no build; per-file and per-project opt-out are the standard Stylelint mechanisms.

## What I am asking

Whether a PR adding the rule at warning level would be considered, and whether `@wordpress/base-styles` is the right package for the rule to read the grid from. Numbers reproduce with `npx stylelint-plugin-rhythmguard` in each checkout. Guide for config authors: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
