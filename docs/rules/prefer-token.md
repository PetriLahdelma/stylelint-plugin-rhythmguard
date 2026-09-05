# `rhythmguard/prefer-token`

Reports raw length literals where a design token should be used, and autofixes to the token when a mapping is known.

Use it once your token system is stable. Until then, the `migration` config runs it with `allowNumericScale: true` so on-scale literals pass while you build the token map.

```json
{
  "rules": {
    "rhythmguard/prefer-token": [
      true,
      { "tokenPattern": "^--spacing-", "tokenMapFromCssCustomProperties": true }
    ]
  }
}
```

## Examples

```css
/* ❌ Raw literals */
.stack {
  gap: 12px;
  padding: 16px;
}

/* ✅ Tokenized */
.stack {
  gap: var(--space-3);
  padding: var(--space-4);
}
```

Message for the failing case:

```
Unexpected raw scale value "12px". Use design tokens for scale decisions. (rhythmguard/prefer-token)
```

## Autofix

Only from an explicit mapping. The rule never guesses a token. Mappings come from, in precedence order:

1. `tokenMap`, inline in the config
2. `tokenMapFile`, a JSON file (see formats below)
3. `tokenMapFromCssCustomProperties`, custom properties in the linted stylesheet whose names match `tokenPattern`, including Tailwind v4 `@theme` blocks
4. `tokenMapFromTailwindSpacing`, `theme.spacing` and `theme.extend.spacing` from a Tailwind v3 JS config

Fix output is source-aware: a token found in `@theme` or CSS becomes `var(--spacing-4)`, one found in a Tailwind JS config becomes `theme(spacing.4)`.

## Token file formats

`tokenMapFile` accepts three JSON shapes.

Flat token-to-value:

```json
{ "--spacing-4": "16px", "--spacing-3": "12px" }
```

Style Dictionary:

```json
{ "--spacing-4": { "value": "16px" } }
```

W3C DTCG:

```json
{
  "spacing": {
    "4": { "$value": "16px", "$type": "dimension" },
    "2": { "$value": "8px", "$type": "dimension" }
  }
}
```

Nested DTCG groups are walked recursively and the key path becomes the variable name, so `spacing.4` maps to `var(--spacing-4)`. Non-length values such as colors and fonts are ignored.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `tokenPattern` | `string` | `^--space-` | Regex for accepted token variable names |
| `tokenFunctions` | `string[]` | `['var','theme','token']` | Functions treated as tokenized values |
| `allowNumericScale` | `boolean` | `false` | Migration mode: on-scale literals pass |
| `preset` | `string` | `rhythmic-4` | Scale used in migration mode |
| `customScale` | `Array<number\|string>` | `undefined` | Highest-priority custom scale override |
| `scale` | `Array<number\|string>` | `[0,4,8,12,16,24,32,40,48,64]` | Used when `allowNumericScale` is on |
| `baseFontSize` | `number` | `16` | Used for `rem` and `em` scale checks |
| `unitStrategy` | `'convert' \| 'exact'` | `'convert'` | Matching strategy in migration mode |
| `units` | `string[]` | `['px','rem','em']` | Units considered for numeric scale checks |
| `enforceInsideMathFunctions` | `boolean` | `false` | Lints inside `calc()`, `clamp()`, `min()`, `max()` |
| `mathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Restricts linting to specific 1-based argument indexes per math function |
| `ignoreMathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Excludes specific 1-based argument indexes per math function |
| `tokenMap` | `Record<string,string>` | `{}` | Raw value to token replacement map |
| `tokenMapFile` | `string` | `null` | JSON file merged into the map (flat, Style Dictionary, or DTCG) |
| `tokenMapFromCssCustomProperties` | `boolean` | `false` | Build the map from matching custom properties in the same stylesheet |
| `tokenMapFromTailwindSpacing` | `boolean` | `false` | Build the map from `theme.spacing` in a Tailwind config |
| `tailwindConfigPath` | `string` | `null` | Tailwind config path for `tokenMapFromTailwindSpacing` (`.js`, `.cjs`, `.mjs`) |
| `ignoreValues` | `string[]` | CSS global keywords + `auto` | Keyword literals to skip |
| `propertyGroups` | `Array<'spacing' \| 'radius' \| 'typography' \| 'size'>` | `['spacing']` | Built-in property groups, used when `properties` is not set |
| `properties` | `Array<string\|RegExp>` | built-in spacing patterns | Explicit property set; strings may be property names or `/regex/flags` |
| `propertyScales` | `Record<propertyOrRegex, scaleOrPreset>` | `{}` | Per-property scale overrides for migration mode |

Option validation behaves as described for [`use-scale`](./use-scale.md#option-validation).

## Related

- [Tailwind integration](../TAILWIND.md) for the `@theme` extraction preset.
- [`rhythmguard audit`](../AUDIT.md) reports token opportunities and missing or unused tokens across a whole tree before you turn this rule on.
