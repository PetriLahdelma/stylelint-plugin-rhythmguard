# Proposal: a spacing rule in `@gitlab/stylelint-config`, reading `$gl-spacing-scale-*`

Target: gitlab.com/gitlab-org/frontend/gitlab-stylelint-config (issue, posted by hand on gitlab.com). Inference reads GitLab's `$gl-spacing-scale-1` to `$gl-spacing-scale-88` (scalars in gitlab-ui `src/scss/variables.scss`, multiples of `$grid-size`) since #167. No independent consumers exist on GitHub; the audience is GitLab's own frontend.

---

GitLab UI defines a spacing scale as `$gl-spacing-scale-N` and utility classes over it. gitlab-ui itself, audited at `8660f9f` over `src/scss` and `src/components`: 3 values off that scale (`src/components/base/path/path.scss:67` `margin-right: $path-chevron-right-margin`, which is 14px; `src/scss/typography.scss:26` `padding: 3px 5px`), which is as quiet as the benchmark gets. The GitLab application's own stylesheets (`app/assets/stylesheets`, 230 files) report 360, but the first hits are in vendored `lazy_bundles/cropper.css`, so that number is not one I would quote until the audit ignores vendored paths by default.

## The proposal

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

With the `$gl-spacing-scale-*` reader in place, the rule measures every consumer against GitLab's scale. Warning severity, two nearest steps in the message, zero, percentages and hairlines exempt, nothing rewritten without `--fix`. The config already ships `stylelint-declaration-strict-value`; this rule is the same idea for the numeric value rather than the variable.

## What I am asking

Whether the rule at warning level belongs in the config. Numbers reproduce with `npx stylelint-plugin-rhythmguard`; guide: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
