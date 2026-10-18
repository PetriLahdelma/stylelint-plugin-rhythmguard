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

- `radius`: `border-radius*`, corner radii, `outline-offset` (which takes spacing tokens and, under `scales`, the spacing scale)
- `typography`: `font-size`, `line-height`, `letter-spacing`, `word-spacing`
- `size`: `width`, `height`, min/max sizes, logical `inline-size` and `block-size`

Values that are `0`, percentages (when `allowPercentages` is on), hairlines (when `allowHairlines` is on, see below), keywords, or tokenized through one of `tokenFunctions` are never reported. A `var()` whose name matches `tokenPattern` is a token, but its fallback is a value: `padding: var(--space-1, 7px)` reports the `7px`, also in a nested `var(--a, var(--b, 7px))`. With `fixWith: "token"`, a fallback is never fixed to the token it is the fallback of; the literal is written instead.

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

1. `scaleSources`: token files listed in the rule options. CSS custom properties (including Tailwind v4 `@theme`), flat JSON, Style Dictionary JSON, or DTCG JSON. A file is read for the spacing names; an explicit `tokenPattern` in the rule options adds the names it matches, as it does for fixes, unless the source sets its own `tokenPattern`. The same holds for steps 2 and 5.
2. `audit.tokenSources` in a `.rhythmguardrc.json` in the working directory, so lint and `rhythmguard audit` read the same token contract.
3. Custom properties in the linted stylesheet whose names match `tokenPattern` (default for auto: names containing `space`, `spacing` or `spacer` as a segment, so `--space-3`, `--mantine-spacing-md` and `--pf-t--global--spacer--200` all match, while `letter-spacing` and `word-spacing` do not).
4. `theme.spacing` from `tailwindConfigPath` (Tailwind v3 JS config).
5. Spacing tokens shipped by design-token packages the project has installed: `tailwindcss` (the v4 `--spacing` base in `theme.css`), `@radix-ui/themes`, `@mantine/core`, `@primer/primitives`, `@shopify/polaris-tokens`, `@spectrum-css/tokens`. The allowlist lives in `src/core/token-packages.json` and additions are welcome.
6. Fallback to the `rhythmic-4` preset. The first report in the file says so: `No spacing tokens were found for scale "auto"; using preset "rhythmic-4".` When a token source failed, the note names it and why, so a wrong path does not look like a project without tokens: `... using preset "rhythmic-4". Token source not found: does-not-exist.css.` An entry in `.rhythmguardrc.json` that cannot be read (an unknown `format`, no `path`, a file that is not JSON) is skipped and named the same way; it never stops the lint.

Declarations in `:root`, `html`, `:host` and `@theme` blocks (through `@media`, `@supports` and `@layer`) are the project's tokens; when they form a scale on their own, custom properties declared inside component selectors such as `.chip { --chip-spacing: 3px }` are left out, because they are a component's parameters. The same holds for CSS and SCSS files in `scaleSources`. When the root carries no scale, every declaration counts. Tokens found in the stylesheet are then only used when they look like a scale: at least three positive steps, mostly whole pixels, and mostly sharing a common step (2, 3, 4, 5 or 8 pixels). Component-local variables such as `--chip-spacing: 3px; --modal-spacing: 25px` do not pass, and the first report then says `The spacing tokens found do not form a spacing scale (no common step); using preset "rhythmic-4".` Point `scaleSources` at the real token file, or tighten `tokenPattern`, when that happens.

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "scale": "auto", "scaleSources": ["./src/theme.css"] }]
  }
}
```

Token values in `rem` and `em` are converted through `baseFontSize`; values in units that cannot convert to `px` are ignored, and so is a non-zero value without a unit (`--space-ratio: 1.5` is a ratio, not 1.5px). A comment or a trailing `!important` in a token value is ignored. Sass variables and maps (`$spacer`, `$spacers: (1: $spacer * .25, ...)`) count too, both in `scaleSources` files and in the linted `.scss` file itself when Stylelint runs with `postcss-scss`; only top-level and `!global` declarations count, so `.compact { $spacer: 2px; }` does not change the scale; names must start with the scale word, so `$dropdown-spacer` is not a token; maps wrapped in `defaults()` or `map.merge()` are read as the merged map. A token file or `.rhythmguardrc.json` saved with a UTF-8 byte order mark is read like one without. In JSON token files, DTCG and Style Dictionary references (`{dimension.100}`, `{size.base.value}`) are resolved within the file, and DTCG 2025.10 dimension objects (`{ "value": 4, "unit": "px" }`) are read. Values written as `calc(<length> * var(--factor))`, the Radix Themes scaling idiom, contribute the length. A bare Tailwind v4 base (`--spacing: 0.25rem`) expands into Tailwind's default multiplier scale. Only `--spacing` is a base: a bare `--space` is one token like `--space-m`. Prefixed names such as `--lb-spacing-md` or `--mantine-spacing-xs` match; `letter-spacing` and `word-spacing` tokens never do. `customScale` still overrides everything.

## Sass expressions

In `.scss` files (Stylelint with `postcss-scss`), a value written as a Sass expression is evaluated and each term checked like a literal:

```scss
$spacer: 1rem;
.card { padding: $spacer * .3 $spacer; }
```

```
Unexpected off-scale value "$spacer * .3". Use scale values (nearest: 4px or 8px). Evaluates to 4.8px. (rhythmguard/use-scale)
```

Variables resolve from the linted file first, then from `scaleSources`, the config file's token sources and installed token packages. `* / + -`, parentheses, negation and `math.div()` are understood; a term that does not resolve (an unknown variable, another function, a keyword) is left alone, as it always was. The hairline allowance and decisions apply to the evaluated value. Expressions are reported, never rewritten: `--fix` does not know whether `$spacer * .3` should become a literal or a different multiplier. The same holds when an expression does not resolve: a literal next to a Sass operator (`$gap * 13px`, `13px / $n`) or inside a Sass module function (`math.div(13px, $n)`) is still reported, but never fixed, since rewriting an operand changes what the expression computes.

## A scale per property group

Spacing and type rarely share a ladder. `scales` gives a property group its own scale next to `scale`, in one rule block:

```json
"rhythmguard/use-scale": [true, {
  "propertyGroups": ["spacing", "typography", "radius"],
  "scale": [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64],
  "scales": {
    "typography": [14, 16, 18, 20, 24, 32, 40],
    "radius": "auto"
  }
}]
```

```
Unexpected off-scale value "17px". Use typography scale values (nearest: 16px or 18px). (rhythmguard/use-scale)
```

Groups are `spacing`, `radius`, `size` and `typography`. Each takes a list of values, a preset name, or `"auto"`, which infers the group's scale from its own tokens: `--font-size-*` and Tailwind's `--text-*` for typography (but not sub-tokens such as `--text-sm--line-height`), `--radius-*` for radius, `--size-*`, `--width-*`, `--height-*` and `--container-*` for size, and the `scale: "auto"` sources above for spacing. With fewer than four values found, the group uses `scale`. Fluid tokens have no single value and are not part of an inferred scale. A property is checked against the most specific scale that applies: its `propertyScales` entry, then its group's `scales` entry, then `scale`. The message names the group only when `scales` supplied the scale, so existing messages do not change. Unitless `line-height` is a ratio, not a length, and stays exempt. The audit takes the same map as `audit.scales` in `.rhythmguardrc.json` and checks each group it names.

## Fluid values

`clamp()`, `min()` and `max()` are skipped by default, so `padding: clamp(13px, 2vi, 17px)` passes where `padding: 13px` does not. `checkMathBounds: true` checks their static bounds like literals: the minimum and maximum of `clamp()`, and every argument of `min()` and `max()` that is one length. The preferred value of `clamp()` (`0.35vi + 0.8rem`) is fluid by design and never checked; neither is an argument that is an expression, a `var()` or a viewport length. A bound that is itself `min()`, `max()` or `clamp()` is followed. Bounds inside a translate function of `transform` (`translateX(clamp(13px, 2vw, 17px))`) and in the `translate` property are checked the same way.

```css
.a { font-size: clamp(0.875rem, 0.35vi + 0.8rem, 1.05rem); }
```

```
Unexpected off-scale clamp() minimum "0.875rem" (14px). Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)
Unexpected off-scale clamp() maximum "1.05rem" (16.8px). Use scale values (nearest: 16px or 24px). (rhythmguard/use-scale)
```

The message names the position: `clamp() minimum`, `clamp() maximum`, `min() argument`, `max() argument`. `--fix` snaps each bound like any literal, and `fixWith: "token"` applies per bound. The option is off by default in 3.x because it adds findings to existing configs; turning it on by default is a candidate for 4.0 ([#172](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/172)). `prefer-token` takes the same option, and the audit has `--check-math-bounds` (or `"checkMathBounds": true` in `.rhythmguardrc.json`).

`enforceInsideMathFunctions` is the older, blunter switch: it lints every length inside `calc()`, `clamp()`, `min()` and `max()`, preferred values included, unless `mathFunctionArguments` narrows it. With both on, a bound is reported once.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `preset` | `string` | `rhythmic-4` | Selects a built-in scale. See [scale presets](../SCALE_PRESETS.md). |
| `fixWith` | `"value" \| "token"` | `"value"` | What autofix writes. `"token"` writes `var(--name)` when exactly one custom property holds the snapped value in the literal's own unit, read from this stylesheet, `scaleSources`, `.rhythmguardrc.json` token sources and installed token packages; otherwise the literal. Negative values become `calc(-1 * var(--name))`. When a token qualifies the message says so: `var(--space-3) holds 12px.` |
| `decisions` | `boolean` | `true` | Read the `decisions` section of `.rhythmguardrc.json`: adopted values count as on scale, allowed values are not findings (optionally on some properties only). See [decisions](../AUDIT.md#decisions). |
| `customScale` | `Array<number\|string>` | `undefined` | Highest-priority custom scale override. An empty list is an invalid option |
| `scale` | `Array<number\|string> \| "auto"` | `[0,4,8,12,16,24,32,40,48,64]` | Allowed values, or `"auto"` to infer them from tokens (see above). An empty list, or `"auto"` inside a list, is an invalid option |
| `scaleSources` | `Array<string \| { path, format? }>` | `[]` | Token files consulted first when `scale` is `"auto"`. `format` is `auto`, `css`, `flat-json`, `style-dictionary` or `dtcg`; any other value is an invalid option |
| `tailwindConfigPath` | `string` | `null` | Tailwind v3 config whose `theme.spacing` feeds `scale: "auto"` |
| `units` | `string[]` | `['px','rem','em']` | Units considered for scale enforcement |
| `unitStrategy` | `'convert' \| 'exact'` | `'convert'` | `convert` compares through px conversion. `exact` compares against same-unit scale values (for `vw`, `cqi`, and similar) |
| `baseFontSize` | `number` | `16` | Used for `rem` and `em` conversion |
| `tokenPattern` | `string` | `^--space-` | Regex for accepted token variable names |
| `tokenFunctions` | `string[]` | `['var','theme','token']` | Functions treated as tokenized values |
| `allowNegative` | `boolean` | `true` | Allows negative scale values. When `false`, a negative value is reported without a fix: `Unexpected value "-8px". Negative values are disabled for this rule.` |
| `allowPercentages` | `boolean` | `true` | Skips `%` values. When `false`, a percentage is reported without a fix: `Unexpected value "5%". Percentages are disabled for this rule.` |
| `allowHairlines` | `boolean` | `true` | Skips non-zero lengths of one CSS pixel or less. See [Hairlines](#hairlines) |
| `fixToScale` | `boolean` | `true` | Enables nearest-value autofix |
| `checkMathBounds` | `boolean` | `false` | Checks the `clamp()` minimum and maximum and each length argument of `min()` and `max()`. See [Fluid values](#fluid-values) |
| `enforceInsideMathFunctions` | `boolean` | `false` | Lints inside `calc()`, `clamp()`, `min()`, `max()` |
| `mathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Restricts linting to specific 1-based argument indexes per math function |
| `ignoreMathFunctionArguments` | `Record<mathFn, number[]>` | `{}` | Excludes specific 1-based argument indexes per math function |
| `propertyGroups` | `Array<'spacing' \| 'radius' \| 'typography' \| 'size'>` | `['spacing']` | Built-in property groups, used when `properties` is not set |
| `properties` | `Array<string\|RegExp>` | built-in spacing patterns | Explicit property set. Strings may be property names or regex-like strings (`/pattern/flags`) |
| `scales` | `Record<group, scale \| preset \| "auto">` | `{}` | A scale per property group (`spacing`, `radius`, `size`, `typography`). See [A scale per property group](#a-scale-per-property-group) |
| `propertyScales` | `Record<propertyOrRegex, scaleOrPreset>` | `{}` | Per-property scale overrides. Keys may be exact names or `/regex/flags`; stateful `g` and `y` flags are normalized. A value is a list of values, a preset name (`{ "padding": "rhythmic-8" }`), or a `{ preset, scale, customScale }` object; an empty list or an unknown preset is an invalid option |
| `note` | `string` | `undefined` | Appended to every finding, after the built-in text. Up to 200 characters. Point agents and reviewers at your own rules: `"See docs/spacing.md for approved exceptions."` |

Scale resolution precedence: `customScale`, then `scale` (a list, or `"auto"` inference), then `preset`, then the default `rhythmic-4`. Per property, `propertyScales` and then `scales` come before all of these.

### Option validation

Unknown option names and wrong shapes fail fast as Stylelint invalid-option warnings. `properties` strings are checked against known scale-targetable CSS properties, `propertyGroups` against the built-in groups, and math-function argument maps against `calc`, `clamp`, `min`, `max` with positive 1-based indexes. A typo such as `"sevverity"` is reported immediately instead of being silently ignored.

## Related

- [`rhythmguard/prefer-token`](./prefer-token.md) once values are on scale and you want tokens instead of literals.
- [`rhythmguard/no-offscale-transform`](./no-offscale-transform.md) to lint transform translations separately; the `strict` config uses it and excludes `transform` from this rule to avoid duplicate reports.
