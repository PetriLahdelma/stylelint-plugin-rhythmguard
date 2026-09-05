# `rhythmguard/use-motion-scale`

Opt-in. Reports transition and animation durations and delays that are not on a motion scale, and raw easing curves that bypass tokens.

This rule is experimental and is not part of `recommended` or `strict`. Real-repo audits found useful signal, but also noise from reduced-motion overrides (`0.01ms`) and generated Storybook assets. The evidence and the conditions for promoting it are in [`MOTION_DEFAULTS_EVIDENCE.md`](../MOTION_DEFAULTS_EVIDENCE.md). Enable it through the `motion` config or directly:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/motion"]
}
```

## Examples

```css
/* ❌ Off-scale timing and a raw easing curve */
.button {
  transition: opacity 175ms cubic-bezier(.2, 0, 0, 1);
}

/* ✅ Timing on the motion scale, easing through a token */
.button {
  transition: opacity 150ms var(--ease-snappy);
}
```

Messages for the failing case:

```
Unexpected motion duration "175ms". Use motion scale values (nearest: 150ms or 200ms). (rhythmguard/use-motion-scale)
Unexpected raw motion easing "cubic-bezier(.2, 0, 0, 1)". Use an easing token. (rhythmguard/use-motion-scale)
```

## Autofix

Durations and delays snap to the nearest scale value when `fixToScale` is on. Easing functions are only replaced when `easingTokenMap` has an exact entry for the raw value; otherwise they are reported without a fix.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `durationScale` | `number[]` | `[0,75,100,150,200,300,500,700,1000]` | Allowed duration and delay values in milliseconds |
| `durationUnits` | `Array<'ms' \| 's'>` | `['ms','s']` | Time units considered by the rule |
| `fixToScale` | `boolean` | `true` | Autofix simple duration and delay values to the nearest scale value |
| `easingTokenMap` | `Record<string,string>` | `{}` | Exact replacements for raw easing functions |

## Related

- [`rhythmguard-tailwind/tailwind-class-use-motion-scale`](./tailwind-class-use-motion-scale.md) covers `duration-[...]`, `delay-[...]` and `ease-[...]` arbitrary values in class strings.
- `rhythmguard audit --include-motion` reports motion drift across a tree without enabling the rule.
