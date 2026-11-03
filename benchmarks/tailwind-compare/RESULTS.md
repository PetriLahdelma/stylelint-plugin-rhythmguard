# Tailwind spacing: what each tool does

Generated 2026-11-03 by `node scripts/bench/tailwind-compare.mjs`, ESLint 10.14.0, default Tailwind theme (`@import "tailwindcss"`). Each class sits alone in `className` in a TSX file.

- **eslint-plugin-better-tailwindcss 4.10.0**: enforce-canonical-classes
- **eslint-plugin-tailwindcss 4.4.0**: no-unnecessary-arbitrary-value, enforces-canonical-classname
- **@shadcn/lint 0.2.3**: no-arbitrary-values
- **Tailwind CLI 4.3.3 `canonicalize`**: default theme
- **Rhythmguard (this checkout) 3.16.1**: tailwind-class-use-scale, scale [0, 4, 8, 12, 16, 24, 32]

| Class | Case | eslint-plugin-better-tailwindcss 4.10.0 | eslint-plugin-tailwindcss 4.4.0 | @shadcn/lint 0.2.3 | Tailwind CLI 4.3.3 `canonicalize` | Rhythmguard (this checkout) 3.16.1 |
| --- | --- | --- | --- | --- | --- | --- |
| `p-[13px]` | off-scale, px | **no finding** | **no finding** | "p-[13px]" hardcodes an off-token value. Use "p-3.25" instead (same value, on the scale). | **no finding** | Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px). |
| `p-[0.8125rem]` | off-scale, rem (13px) | The class: "p-[0.8125rem]" can be simplified to "p-3.25". | Class 'p-[0.8125rem]' can be written as 'p-3.25' | "p-[0.8125rem]" hardcodes an off-token value. Use a theme token or scale value instead. | rewrites to `p-3.25` | Unexpected Tailwind arbitrary spacing value "p-[0.8125rem]". Use "p-3" (12px) or "p-4" (16px). |
| `gap-[18px]` | off-scale, px | **no finding** | **no finding** | "gap-[18px]" hardcodes an off-token value. Use "gap-4.5" instead (same value, on the scale). | **no finding** | Unexpected Tailwind arbitrary spacing value "gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px). |
| `p-[12px]` | on-scale, bracketed | **no finding** | No need for arbitrary 'p-[12px]', use 'p-3' instead | "p-[12px]" hardcodes an off-token value. Use "p-3" instead (same value, on the scale). | **no finding** | **no finding** |
| `p-3.25` | off-scale v4 step (13px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `gap-4.5` | off-scale v4 step (18px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `p-13` | off-scale v4 step (52px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `p-1.5` | default-theme step (6px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
