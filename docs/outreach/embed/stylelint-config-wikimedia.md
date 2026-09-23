# Proposal: a spacing rule in `stylelint-config-wikimedia`, reading Codex design tokens

Target: wikimedia/stylelint-config-wikimedia (issue). Preconditions before posting: add `@wikimedia/codex-design-tokens` (`--spacing-*` in `theme-wikimedia-ui.css`) to the token-package allowlist so consumers are measured against Codex, not a default; and say plainly that the audit reads CSS and SCSS only, since most Wikimedia skins and extensions are Less.

---

Wikimedia's spacing scale lives in Codex design tokens (`--spacing-25` to `--spacing-400`, 4px steps up to 16px, then 8). Projects that extend `stylelint-config-wikimedia` and write SCSS step off it. One such project, audited 2026-09-23:

**Liquipedia/Lua-Modules** at `5bfae50`, 70 SCSS files under `stylesheets/`: 464 declarations off a 4px grid.

| File | Line | Declaration | Nearest steps |
| --- | ---: | --- | --- |
| `stylesheets/commons/Ambox.scss` | 14 | `margin: 5px` | 4px or 8px |
| `stylesheets/commons/Ambox.scss` | 26 | `padding: 5px` | 4px or 8px |
| `stylesheets/commons/AutomaticPointsTable.scss` | 9 | `margin-bottom: 20px` | 16px or 24px |

Top values: `5px` ×126, `10px` ×49, `2px` ×41. Top properties: `padding` ×198, `margin` ×56, `padding-left` ×31.

The other active consumers found (Citizen skin, miraheze/ManageWiki, miraheze/CreateWiki) are Less codebases, which this tool does not read; that is a gap on my side, not a claim about them.

## The proposal

```js
plugins: ['stylelint-plugin-rhythmguard'],
rules: {
  'rhythmguard/use-scale': [true, { scale: 'auto', severity: 'warning' }],
},
```

For CSS and SCSS consumers. `scale: "auto"` reads the project's own tokens first, then installed `@wikimedia/codex-design-tokens`, then a default announced once per file. A warning names the value and the two nearest steps; zero, percentages and hairlines are exempt; nothing is rewritten without `--fix`.

## What I am asking

Whether a PR adding the rule at warning level would be considered for the CSS/SCSS side of the config. If Wikimedia's answer is that spacing is Codex's job at the component level and not a lint concern, that is a complete answer. Numbers reproduce with `npx stylelint-plugin-rhythmguard` in a checkout. Guide: https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_CONFIG_AUTHORS.md
