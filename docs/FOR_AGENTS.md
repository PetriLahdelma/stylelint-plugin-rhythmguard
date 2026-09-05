# Rhythmguard for coding agents

Coding agents write fluent CSS and Tailwind without knowing a project's spacing scale, so they are the fastest source of off-scale values. Rhythmguard is deterministic, needs no configuration to give a first answer, and explains every finding with the two nearest on-scale values. This page is what an agent (or the person writing its instructions) needs.

## Paste into `AGENTS.md`

```md
## Spacing scale

This project enforces its spacing scale with stylelint-plugin-rhythmguard.

- Before finishing any change to CSS or to Tailwind class strings, run `npx rhythmguard audit . --format json` (or `npx stylelint "**/*.css"` if a config exists) and fix every `off-scale` finding.
- A finding names the value and the two nearest on-scale values. Prefer the design token for that value when one exists; otherwise use the nearest on-scale value. Never invent a new spacing value.
- Do not use `--fix` on spacing findings unless the task says so. Snapping a value can change layout; choose the value deliberately.
- Values of one pixel or less (hairlines) and percentages are allowed and are not findings.
- Tailwind arbitrary spacing values such as `p-[13px]` are findings too; use the scale utility (`p-3`) or an on-scale arbitrary value.
- When the audit's `contracts.scale.offScaleProperties` table is dominated by margins on sibling elements, put a `gap` on the parent instead of fixing each margin. The parent owns the spacing between its children.
- If the audit reports the scale source as `fallback`, the project has no discoverable spacing tokens. Ask before adding any; do not guess a scale.
```

Trim it to the lines that apply. The whole value of an agent instruction is that it is short and true.

## Commands and what they return

| Command | Use it when | Output |
| --- | --- | --- |
| `npx rhythmguard` | First contact with a repository | Detected stack, inferred scale with its source, findings summary, a config to paste. Human-readable, exit 0 |
| `npx rhythmguard audit . --format json` | You need to act on findings | Stable JSON 2.0 contract: `contracts.scale.values`, `.source` and `.offScaleProperties`, `findings.css[]` and `findings.tailwind[]` with `file`, `line`, `column`, `value`, `type`, `text`, and `property` on CSS findings. Exit 0 unless a gate flag is set |
| `npx rhythmguard audit . --scale auto --format github` | Running inside GitHub Actions | One `::warning file=…,line=…::…` per finding |
| `npx rhythmguard audit . --since-baseline --fail-on-new-drift` | Gating a change in CI | Exit 1 only when the change introduced drift not in `.rhythmguard-baseline.json` |
| `npx stylelint "**/*.css"` | A Stylelint config with Rhythmguard exists | Standard Stylelint output; messages end with `(rhythmguard/use-scale)` |

JSON finding shapes are documented in [`AUDIT.md`](./AUDIT.md) and typed in `stylelint-plugin-rhythmguard/audit`. Every field an agent should key on is stable across 2.x.

## Reading a finding

```
Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)
```

- `13px` is the literal in the source. `12px` and `16px` are the two scale steps around it.
- If the project has a token for the value you choose (the `prefer-token` rule or the audit's token contract will say so), use the token: `var(--space-3)`, `theme(spacing.3)`, or the Tailwind utility.
- `Unexpected raw scale value "12px". Use design tokens…` is a different message: the value is on scale, but a token exists for it. Replace with the token.
- A message ending in `No spacing tokens were found for scale "auto"; using preset "rhythmic-4"` means the scale was not the project's own. Treat it as informational, not as a reason to add tokens.

## What Rhythmguard does not do

It does not check colors or hex values. It does not enforce token usage unless `prefer-token` is enabled. The Stylelint rules do not see Tailwind class strings; that is the ESLint companion (`stylelint-plugin-rhythmguard/eslint`), which must be configured separately. SCSS files are audited only when `postcss-scss` is installed; otherwise the audit counts them as skipped and says so. An agent that expects any of these will look for findings that never come.

## Why the defaults are quiet

Zero, percentages and hairlines (one CSS pixel or less) are exempt, and the scale is inferred from the project's own tokens rather than assumed. The [quiet benchmark](./QUIET_BENCHMARK.md) runs the `recommended` profile against public design systems on every change and fails if the findings move. What the tool reports is meant to be worth an agent's attention; if it is not, that is a bug, and a reproduction in an issue is enough.
