---
name: rhythmguard
description: Keep CSS and Tailwind spacing on the project scale. Use when writing or changing CSS, SCSS, CSS Modules or Tailwind class strings, and before finishing any such change.
when_to_use: Adding or changing padding, margin, gap, inset or other spacing in a stylesheet or a class string; reviewing a diff that does.
allowed-tools: Bash(npx rhythmguard audit . --scale auto --format json)
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.jsx"
  - "**/*.tsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.astro"
  - "**/*.html"
---

## Spacing scale

This project enforces its spacing scale with stylelint-plugin-rhythmguard.

- Before finishing any change to CSS or to Tailwind class strings, run `npx rhythmguard audit . --scale auto --format json` (or `npx stylelint "**/*.css"` if a config exists) and fix every `off-scale` finding. Without `--scale auto` the audit checks a built-in scale, not this project's.
- In a project with ESLint or Oxlint and no Stylelint, the audit reads class strings only and lists the stylesheets it skipped; run `npx eslint .` (or `npx oxlint`) as well, and do not install Stylelint unless the task asks for it.
- A finding names the value and the two nearest on-scale values. Prefer the design token for that value when one exists; otherwise use the nearest on-scale value. Never invent a new spacing value.
- Never invent a token name. Use a token only if the project defines it: the audit lists them under `contracts.tokens.definedTokens`, and any `var()` it cannot find under `contracts.tokens.missingTokens`. A `var()` that points at nothing renders no spacing at all.
- Do not use `--fix` on spacing findings unless the task says so. Snapping a value can change layout; choose the value deliberately.
- Values of one pixel or less (hairlines) and percentages are allowed and are not findings.
- Tailwind arbitrary spacing values such as `p-[13px]` are findings too. The finding names the two utility classes to choose from (`p-3` or `p-4`); write one of those, not another arbitrary value.
- When the audit's `contracts.scale.offScaleProperties` table is dominated by margins on sibling elements, put a `gap` on the parent instead of fixing each margin. The parent owns the spacing between its children.
- If the audit reports the scale source as `fallback`, the project has no discoverable spacing tokens. Ask before adding any; do not guess a scale.

Source: docs/FOR_AGENTS.md in the stylelint-plugin-rhythmguard repository (https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/FOR_AGENTS.md). Regenerate with `npx rhythmguard init --agents`.
