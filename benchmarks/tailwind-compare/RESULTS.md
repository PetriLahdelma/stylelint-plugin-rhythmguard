# Tailwind spacing: what each tool does

Generated 2026-11-16 by `node scripts/bench/tailwind-compare.mjs`, ESLint 10.15.0, default Tailwind theme (`@import "tailwindcss"`). Each class sits alone in `className` in a TSX file. Messages are quoted as printed, with an em dash shown as a hyphen.

- **eslint-plugin-better-tailwindcss 4.10.0**: enforce-canonical-classes
- **eslint-plugin-tailwindcss 4.4.0**: no-unnecessary-arbitrary-value, enforces-canonical-classname
- **@shadcn/lint 0.2.5**: no-arbitrary-values
- **oxlint-tailwindcss 1.17.1**: no-arbitrary-value, prefer-scale-token, no-unnecessary-arbitrary-value, enforce-canonical, under Oxlint 1.93.0
- **Tailwind CLI 4.3.4 `canonicalize`**: default theme
- **Rhythmguard (this checkout) 3.20.1**: tailwind-class-use-scale, scale [0, 4, 8, 12, 16, 24, 32]

| Class | Case | eslint-plugin-better-tailwindcss 4.10.0 | eslint-plugin-tailwindcss 4.4.0 | @shadcn/lint 0.2.5 | oxlint-tailwindcss 1.17.1 | Tailwind CLI 4.3.4 `canonicalize` | Rhythmguard (this checkout) 3.20.1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `p-[13px]` | off-scale, px | **no finding** | **no finding** | "p-[13px]" hardcodes an off-token value. Use "p-3.25" instead (same value, on the scale). | "p-[13px]" uses an arbitrary value. Closest in your theme: p-3 (12px) or p-3.5 (14px). If none fits, add a token to app.css. | **no finding** | Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px). |
| `p-[0.8125rem]` | off-scale, rem (13px) | The class: "p-[0.8125rem]" can be simplified to "p-3.25". | Class 'p-[0.8125rem]' can be written as 'p-3.25' | "p-[0.8125rem]" hardcodes an off-token value. Use a theme token or scale value instead. | "p-[0.8125rem]" uses an arbitrary value. Closest in your theme: p-3 (0.75rem) or p-3.5 (0.875rem). If none fits, add a token to app.css. | rewrites to `p-3.25` | Unexpected Tailwind arbitrary spacing value "p-[0.8125rem]". Use "p-3" (12px) or "p-4" (16px). |
| `gap-[18px]` | off-scale, px | **no finding** | **no finding** | "gap-[18px]" hardcodes an off-token value. Use "gap-4.5" instead (same value, on the scale). | "gap-[18px]" uses an arbitrary value. Closest in your theme: gap-4.5 (18px). If none fits, add a token to app.css.; "gap-[18px]" is the same value as "gap-4.5". Use the token - but check it first: the token resolves through a CSS variable, so the two are equal in this theme, not by construction. | **no finding** | Unexpected Tailwind arbitrary spacing value "gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px). |
| `p-[12px]` | on-scale, bracketed | **no finding** | No need for arbitrary 'p-[12px]', use 'p-3' instead | "p-[12px]" hardcodes an off-token value. Use "p-3" instead (same value, on the scale). | "p-[12px]" uses an arbitrary value. Closest in your theme: p-3 (12px). If none fits, add a token to app.css.; "p-[12px]" is the same value as "p-3". Use the token - but check it first: the token resolves through a CSS variable, so the two are equal in this theme, not by construction. | **no finding** | **no finding** |
| `p-3.25` | off-scale v4 step (13px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `gap-4.5` | off-scale v4 step (18px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `p-13` | off-scale v4 step (52px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |
| `p-1.5` | default-theme step (6px) | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** | **no finding** |

## Both together

The @shadcn/lint pairing in [docs/TAILWIND.md](../../docs/TAILWIND.md#one-config-each-value-reported-once), run as written on a JSX file. Each class is reported by at most one rule; the script fails otherwise.

| Class | Reported by |
| --- | --- |
| `p-[13px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `md:gap-[18px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `-mt-[7px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `hover:-translate-y-[3px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `scroll-pt-[13px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `inset-x-[13px]` | `rhythmguard-tailwind/tailwind-class-use-scale` |
| `p-[12px]` | nothing (on the scale) |
| `w-[203px]` | `shadcn/no-arbitrary-values` |
| `bg-[#ff5733]` | `shadcn/no-arbitrary-values` |
| `text-[13px]` | `shadcn/no-arbitrary-values` |
| `rounded-[5px]` | `shadcn/no-arbitrary-values` |
