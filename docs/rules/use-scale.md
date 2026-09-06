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

Values that are `0`, percentages (when `allowPercentages` is on), hairlines (when `allowHairlines` is on, see below), keywords, or tokenized through one of `tokenFunctions` are never reported.

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

## Hairlines

A hairline is a non-zero length that resolves to one CSS pixel or less: `1px`, `-1px`, `0.5px`, `0.0625rem`. These values are not spacing decisions. They compensate for something else:

- `margin: -1px` pulls a border over the neighbouring border so two 1px lines do not stack.
- `inset: 1px` or `top: -1px` nudges a focus ring or an icon into optical alignment.
- `margin: -1px; width: 1px; height: 1px` is the visually-hidden pattern for screen-reader-only text.
- `translateY(1px)` corrects subpixel rendering.

Reporting them as "off the scale, use 0 or 4px" is technically true and practically wrong, and it is the kind of report that makes teams turn a rule off. The [quiet benchmark](../QUIET_BENCHMARK.md) confirmed it: across Radix Themes, Mantine, Primer React and Liveblocks, hairlines were the only systematic false positive left once percentages were handled. So the rule exempts them by default. Set `allowHairlines: false` to report them; a team that renders hairlines through a token such as `var(--border-width)` may want exactly that.

The exemption is by resolved size, not by literal: `0.0625rem` at a 16px base is a hairline, `1.5px` is not, and `0` is never reported anyway. Percentages are governed by `allowPercentages`, not by this option.

## Autofix

Deterministic: the value is replaced with the nearest scale step, preserving sign and unit (`rem` and `em` are converted through `baseFontSize` unless `unitStrategy` is `exact`). Turn it off with `fixToScale: false` when snapping would change visuals you have not reviewed; the Digitaltableteur rollout runs the rule at warning level with autofix disabled.

## Automatic scale

`scale: "auto"` infers the scale from your spacing tokens instead of a hand-written list, so a shared config can enable the rule without knowing each consumer's scale. The first source that yields tokens wins; sources are not merged.

1. `scaleSources`: token files listed in the rule options. CSS custom properties (including Tailwind v4 `@theme`), flat JSON, Style Dictionary JSON, or DTCG JSON.
2. `audit.tokenSources` in a `.rhythmguardrc.json` in the working directory, so lint and `rhythmguard audit` read the same token contract.
3. Custom properties in the linted stylesheet whose names match `tokenPattern` (default for auto: names containing `space`, `spacing` or `spacer` as a segment, so `--space-3`, `--mantine-spacing-md` and `--pf-t--global--spacer--200` all match, while `letter-spacing` and `word-spacing` do not).
4. Spacing tokens shipped by design-token packages the project has installed: `tailwindcss` (the v4 `--spacing` base in `theme.css`), `@radix-ui/themes`, `@mantine/core`, `@primer/primitives`, `@shopify/polaris-tokens`, `@spectrum-css/tokens`. The allowlist lives in `src/utils/token-packages.json` and additions are welcome.
5. `theme.spacing` from `tailwindConfigPath` (Tailwind v3 JS config).
6. Fallback to the `rhythmic-4` preset. The first report in the file says so: `No spacing tokens were found for scale "auto"; using preset "rhythmic-4".`

Tokens found in the stylesheet are only used when they look like a scale: at least three positive steps, mostly whole pixels, and mostly sharing a common step (2, 3, 4, 5 or 8 pixels). Component-local variables such as `--chip-spacing: 3px; --modal-spacing: 25px` do not pass, and the first report then says `The spacing tokens found do not form a spacing scale (no common step); using preset "rhythmic-4".` Point `scaleSources` at the real token file, or tighten `tokenPattern`, when that happens.

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto", "scaleSources": ["./src/theme.css"] }]
  }
}
```

Token values in `rem` and `em` are converted through `baseFontSize`; values in units that cannot convert to `px` are ignored. Sass variables and maps (`$spacer`, `$spacers: (1: $spacer * .25, ...)`) count too, both in `scaleSources` files and in the linted `.scss` file itself when Stylelint runs with `postcss-scss`; names must start with the scale word, so `$dropdown-spacer` is not a token. Values written as `calc(<length> * var(--factor))`, the Radix Themes scaling idiom, contribute the length. A bare Tailwind v4 base (`--spacing: 0.25rem`) expands into Tailwind's default multiplier scale. Prefixed names such as `--lb-spacing-md` or `--mantine-spacing-xs` match; `letter-spacing` and `word-spacing` tokens never do. `customScale` still overrides everything.

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
| `allowHairlines` | `boolean` | `true` | Skips non-zero lengths of one CSS pixel or less. See [Hairlines](#hairlines) |
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
