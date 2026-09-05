# `rhythmguard/no-offscale-transform`

Reports transform translation offsets that are not on the spacing scale, and autofixes to the nearest on-scale value.

It exists so motion offsets can be governed separately from layout spacing. The `strict` config enables it and removes `transform` from [`use-scale`](./use-scale.md) so a single off-scale translation is reported once.

```json
{
  "rules": {
    "rhythmguard/no-offscale-transform": [true, { "scale": [0, 4, 8, 12, 16, 24, 32] }]
  }
}
```

## What it checks

- `translate`, `translate-x`, `translate-y`, `translate-z`
- `transform` translation functions: `translate`, `translateX`, `translateY`, `translateZ`, `translate3d`

Other transform functions (`scale`, `rotate`, `skew`) are ignored.

## Examples

```css
/* ❌ Off-scale motion */
.toast {
  transform: translateY(18px) scale(1);
}

/* ✅ Motion on the spacing scale */
.toast {
  transform: translateY(16px) scale(1);
}
```

Message for the failing case:

```
Unexpected transform translation value "18px". Use scale values (nearest: 16px or 24px). (rhythmguard/no-offscale-transform)
```

## Autofix

Same deterministic nearest-value fix as `use-scale`, applied only to translation arguments. Set `fixToScale: false` to report without rewriting.

## Options

Accepts the same scale options as [`rhythmguard/use-scale`](./use-scale.md#options), including `scale: "auto"` with `scaleSources` and `tailwindConfigPath` (see [automatic scale](./use-scale.md#automatic-scale)): `preset`, `customScale`, `scale`, `units`, `unitStrategy`, `baseFontSize`, `tokenPattern`, `tokenFunctions`, `allowNegative`, `allowPercentages`, `allowHairlines` (one-pixel translations such as `translateY(1px)` are exempt by default, see [Hairlines](./use-scale.md#hairlines)), `fixToScale`, `enforceInsideMathFunctions`, `mathFunctionArguments`, `ignoreMathFunctionArguments`. Property selection options are not accepted because the property set is fixed to translations.

Unknown option names and wrong value shapes are rejected up front, as for every Rhythmguard rule.
