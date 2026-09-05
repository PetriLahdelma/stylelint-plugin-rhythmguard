# `rhythmguard-tailwind/tailwind-class-use-motion-scale`

ESLint rule, opt-in. Reports Tailwind arbitrary motion values (`duration-[...]`, `delay-[...]`) that are not on the motion scale, and raw easing curves in `ease-[...]`.

Like its Stylelint counterpart [`use-motion-scale`](./use-motion-scale.md), this rule is experimental and is `off` in the exported `recommended` config.

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-motion-scale': ['warn', { durationScale: [0, 75, 100, 150, 200, 300, 500] }],
    },
  },
];
```

## Examples

```tsx
{/* ❌ Off-scale duration and a raw easing curve */}
<button className="transition duration-[175ms] ease-[cubic-bezier(.2,0,0,1)]" />

{/* ✅ On the motion scale */}
<button className="transition duration-[150ms] ease-out" />
```

Message for the failing case:

```
Unexpected Tailwind arbitrary motion duration "duration-[175ms]". Use duration scale values (nearest: 150ms or 200ms).
```

## Autofix

Duration and delay values snap to the nearest scale step inside string literals. Easing values are reported only. Negative durations are reported without a fix.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `durationScale` | `number[]` | `[0,75,100,150,200,300,500,700,1000]` | Allowed duration and delay values in milliseconds |
| `durationUnits` | `Array<'ms' \| 's'>` | `['ms','s']` | Time units considered |

## Related

- [`rhythmguard/use-motion-scale`](./use-motion-scale.md) for CSS declarations.
- [`MOTION_DEFAULTS_EVIDENCE.md`](../MOTION_DEFAULTS_EVIDENCE.md) for why motion stays opt-in.
