# Even shadcn/ui has spacing drift.

> A real-world audit of the shadcn/ui v4 app codebase using [Rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard).

## TL;DR

- **CSS files:** 91% clean — only 2 off-scale values in 11 stylesheets. Impressive discipline.
- **Tailwind class strings:** 178+ arbitrary spacing values. `ml-[-0.15rem]`, `-[3px]`, `-[18.4px]` in 10 different registry styles.
- **The lesson:** CSS discipline alone isn't enough. The Tailwind `[arbitrary]` escape hatch is where drift happens now.

## Method

```bash
git clone --depth 1 https://github.com/shadcn-ui/ui.git
cd ui/apps/v4
npx rhythmguard audit .
```

## CSS audit

```
  ┌─ RHYTHMGUARD AUDIT ─────────────────────────────────────────┐
  │  apps/v4                                                    │
  └─────────────────────────────────────────────────────────────┘

  Files scanned         11
  Files with issues      1  (9%)
  Scale cleanliness   ██████████████████░░  91%

  ── OFF-SCALE VALUES ──  2 total

  0.3rem         ██████████████████████████████ 1
  0.1rem         ██████████████████████████████ 1
```

Both violations live in [`apps/v4/app/globals.css:412-413`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/globals.css#L412-L413):

```css
padding-inline: 0.3rem;   /* off-scale — use 4px or 8px */
padding-block: 0.1rem;    /* off-scale — use 2px */
```

On a rhythmic-4 scale (`0, 4, 8, 12, 16, 24, 32, 40, 48, 64`), `0.3rem ≈ 4.8px` and `0.1rem = 1.6px` — neither matches a step.

## The Tailwind reality check

CSS-side discipline is excellent. But run `grep` for arbitrary spacing utilities in the registry styles and you'll find:

| Utility class | Count |
|---|---|
| `-[3px]` | 29 |
| `-[0.625rem]` | 11 |
| `-[-0.15rem]` | 8 |
| `-[100px]` | 7 |
| `-[-10px]` | 7 |
| `-[2px]` | 6 |
| `-[24px]` | 5 |
| `-[14px]` | 5 |
| `-[1.5px]` | 5 |
| `-[32px]` | 4 |
| `-[18.4px]` | 4 |
| `-[-0.3rem]` | 4 |
| ... | ... |

**178 arbitrary spacing values** across 10 registry style files. Classes like:

```jsx
<div className="pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]" />
```

None of these would be caught by Stylelint or Prettier — they're opaque to both. Rhythmguard's ESLint companion flags them.

## What this proves

shadcn/ui has remarkable CSS discipline. 91% clean. That's genuinely rare.

But the Tailwind arbitrary-value escape hatch is where spacing drift happens in 2026. It's not the `margin: 13px` of old; it's `ml-[-0.15rem]` hidden in a component variant.

If shadcn has this drift, yours does too.

## Try it on your project

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
npx rhythmguard audit ./src
```

Or paste CSS in the [browser playground](https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/) — no install.

---

*Rhythmguard — token governance for CSS and Tailwind. [GitHub](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard) · [npm](https://www.npmjs.com/package/stylelint-plugin-rhythmguard).*
