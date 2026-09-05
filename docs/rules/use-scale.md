# `rhythmguard/use-scale`

Reports length values that are not on your spacing scale, and autofixes to the nearest on-scale value.

This is the rule to start with. It is on in every shipped config.

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "preset": "rhythmic-4" }]
  }
}
```

## What it checks

By default the `spacing` property group:

- `margin*`, `padding*`
- `gap`, `row-gap`, `column-gap`
- `inset*`, `scroll-margin*`, `scroll-padding*`
- `translate`, `translate-x`, `translate-y`, `translate-z`
- `transform` translation functions (`translate`, `translateX`, `translateY`, `translateZ`, `translate3d`)

Opt-in groups via `propertyGroups`:

- `radius`: `border-radius*`, corner radii, `outline-offset`
- `typography`: `font-size`, `line-height`, `letter-spacing`, `word-spacing`
- `size`: `width`, `height`, min/max sizes, logical `inline-size` and `block-size`

Values that are `0`, percentages (when `allowPercentages` is on), keywords, or tokenized through one of `tokenFunctions` are never reported.

## Examples

```css
/* ❌ Off-scale */
.card {
  margin: 13px;
  transform: translateY(18px);
}

/* ✅ On-scale */
.card {
  margin: 12px;
  transform: translateY(16px);
}
```

Message for the failing case:

```
Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)
```

## Autofix

Deterministic: the value is replaced with the nearest scale step, preserving sign and unit (`rem` and `em` are converted through `baseFontSize` unless `unitStrategy` is `exact`). Turn it off with `fixToScale: false` when snapping would change visuals you have not reviewed; the Digitaltableteur rollout runs the rule at warning level with autofix disabled.

## Automatic scale

`scale: "auto"` infers the scale from your spacing tokens instead of a hand-written list, so a shared config can enable the rule without knowing each consumer's scale. The first source that yields tokens wins; sources are not merged.

1. `scaleSources`: token files listed in the rule options. CSS custom properties (including Tailwind v4 `@theme`), flat JSON, Style Dictionary JSON, or DTCG JSON.
2. `audit.tokenSources` in a `.rhythmguardrc.json` in the working directory, so lint and `rhythmguard audit` read the same token contract.
3. Custom properties in the linted stylesheet whose names match `tokenPattern` (default for auto: `^--(space|spacing)-`).
4. `theme.spacing` from `tailwindConfigPath` (Tailwind v3 JS config).
5. Fallback to the `rhythmic-4` preset. The first report in the file says so: `No spacing tokens were found for scale "auto"; using preset "rhythmic-4".`

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto", "scaleSources": ["./src/theme.css"] }]
  }
}
```

Token values in `rem` and `em` are converted through `baseFontSize`; values in units that cannot convert to `px` are ignored. Values written as `calc(<length> * var(--factor))`, the Radix Themes scaling idiom, contribute the length. A bare Tailwind v4 base (`--spacing: 0.25rem`) expands into Tailwind's default multiplier scale. Prefixed names such as `--lb-spacing-md` or `--mantine-spacing-xs` match; `letter-spacing` and `word-spacing` tokens never do. `customScale` still overrides everything.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preset` | `string` | `rhythmic-4` | Selects a built-in scale. See [scale presets](../SCALE_PRESETS.md). |
| `customScale` | `Array<number\|string>` | `undefined` | Highest-priority custom scale override |
| `scale` | `Array<number\|string> \| "auto"` | `[0,4,8,12,16,24,32,40,48,64]` | Allowed values, or `"auto"` to infer them from tokens (see above) |
| `scaleSources` | `Array<string \| { path, format? }>` | `[]` | Token files consulted first when `scale` is `"auto"` |
| `tailwindConfigPath` | `string` | `null` | Tailwind v3 config whose `theme.spacing` feeds `scale: "auto"` |
| `units` | `string[]` | `['px','rem','em']` | Units considered for scale enforcement |
| `unitStrategy` | `'convert' \| 'exact'` | `'convert'` | `convert` compares through px conversion. `exact` compares against same-unit scale values (for `vw`, `cqi`, and similar) |
| `baseFontSize` | `number` | `16` | Used for `rem` and `em` conversion |
| `tokenPattern` | `string` | `^--space-` | Regex for accepted token variable names |
| `tokenFunctions` | `string[]` | `['var','theme','token']` | Functions treated as tokenized values |
| `allowNegative` | `boolean` | `true` | Allows negative scale values |
| `allowPercentages` | `boolean` | `true` | Skips `%` values |
| `fixToScale` | `boolean` | `true` | Enables nearest-value autofix |
| `enforceInsideMathFunctions` | `boolean` | `false` | Lints inside `calc()`, `clamp()`, `min()`, `max()` |
| `mathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Restricts linting to specific 1-based argument indexes per math function |
| `ignoreMathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Excludes specific 1-based argument indexes per math function |
| `propertyGroups` | `Array<'spacing' \| 'radius' \| 'typography' \| 'size'>` | `['spacing']` | Built-in property groups, used when `properties` is not set |
| `properties` | `Array<string\|RegExp>` | built-in spacing patterns | Explicit property set. Strings may be property names or regex-like strings (`/pattern/flags`) |
| `propertyScales` | `Record<propertyOrRegex, scaleOrPreset>` | `{}` | Per-property scale overrides. Keys may be exact names or `/regex/flags`; stateful `g` and `y` flags are normalized |

Scale resolution precedence: `customScale`, then `scale` (a list, or `"auto"` inference), then `preset`, then the default `rhythmic-4`.

### Option validation

Unknown option names and wrong shapes fail fast as Stylelint invalid-option warnings. `properties` strings are checked against known scale-targetable CSS properties, `propertyGroups` against the built-in groups, and math-function argument maps against `calc`, `clamp`, `min`, `max` with positive 1-based indexes. A typo such as `"sevverity"` is reported immediately instead of being silently ignored.

## Related

- [`rhythmguard/prefer-token`](./prefer-token.md) once values are on scale and you want tokens instead of literals.
- [`rhythmguard/no-offscale-transform`](./no-offscale-transform.md) to lint transform translations separately; the `strict` config uses it and excludes `transform` from this rule to avoid duplicate reports.
