# Motion Defaults Evidence

Date: 2026-06-16

Question: should `rhythmguard/use-motion-scale` move from opt-in to a recommended profile?

Decision: keep motion checks opt-in for now.

## Local Evidence

Commands were run from this repository with the current source:

```bash
node src/cli/index.js audit <target> --include-motion --format json --output <tmp-file>
```

| Target | Files scanned | CSS findings | Tailwind findings | Motion findings | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `digitaltableteur-nextjs/app` | 138 | 225 | 0 | 5 | Useful signal, but includes two `0.01ms` reduced-motion declarations that are likely intentional accessibility overrides. |
| `aegis-design-os` | 267 | 328 | 0 | 0 | No observed motion drift in the current tree. |
| `DSharp.DesignSystem/packages` | 1,424 | 214 | 13 | 10 | Half the sampled findings came from generated `storybook-static` output, which should be ignored before gating. |
| `DSharp.DesignSystem/packages/react/src` | 403 | 0 | 5 | 5 | Source-only scan reports real motion design-system decisions: `2.1s`, `-1.05s`, and Material-style cubic-bezier curves. |

## Interpretation

The motion rule is finding real design-system questions, especially long-running durations and raw easing curves. That is useful for audit review and cleanup planning.

It is not ready for the default `recommended` profile because:

- Generated assets can add noise unless teams configure ignores.
- Reduced-motion accessibility overrides such as `0.01ms` need a documented allowance before default gating.
- Raw cubic-bezier values can be intentional brand motion primitives until a token map exists.

## Recommended Next Gate

Keep motion available through:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/motion"]
}
```

and through audit:

```bash
npx rhythmguard audit ./src --include-motion
```

Revisit default inclusion after:

1. Reduced-motion override patterns are documented or configurable.
2. Generated asset ignores are prominent in adoption recipes.
3. At least three source-only audits show motion findings with low false-positive review cost.
