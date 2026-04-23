---
title: I ran a spacing audit on shadcn/ui. Even it has drift.
published: false
tags: tailwindcss, css, designsystems, webdev
cover_image: https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-cover.svg?v=1
---

Short post. Two things to share.

## The audit

I ran [Rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard) against the shadcn/ui v4 app. I expected drift. I did not expect what I actually found.

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

**91% clean CSS.** Only 2 off-scale values across 11 stylesheets. That is, frankly, remarkable. Most production codebases score 30-60%.

Then I grepped the Tailwind class strings.

```bash
$ grep -rE '-\[.*(rem|px)\]' apps/v4 --include="*.css" \
    | grep -oE '\-\[-?[0-9]+(\.[0-9]+)?(px|rem)\]' \
    | sort | uniq -c | sort -rn | head

  29 -[3px]
  11 -[0.625rem]
   8 -[-0.15rem]
   7 -[100px]
   7 -[-10px]
   6 -[2px]
   5 -[24px]
   5 -[14px]
   5 -[1.5px]
   5 -[-1.5px]
```

**178 arbitrary spacing values** hidden in Tailwind class strings. `ml-[-0.15rem]`. `mr-[-0.3rem]`. `-[18.4px]`. Things like:

```jsx
<div className="pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]" />
```

Stylelint doesn't see these. Prettier doesn't see these. `eslint-plugin-tailwindcss` doesn't see these either — it governs class names, not the numbers inside `[arbitrary]` brackets.

Full audit writeup with sources: [gist.github.com/PetriLahdelma/2ad44d6dc2022f48c67f839c6440745c](https://gist.github.com/PetriLahdelma/2ad44d6dc2022f48c67f839c6440745c)

## The point

If shadcn/ui — a codebase obsessed with design discipline — has 178 arbitrary spacing values, so does yours. Probably more.

The `[arbitrary]` escape hatch is where drift lives in 2026. It's not `margin: 13px` anymore. It's `ml-[-0.15rem]` buried in a component variant, compounded across thousands of usages.

## The playground

Don't install anything. Try it in the browser:

**[petrilahdelma.github.io/stylelint-plugin-rhythmguard](https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/)**

Paste your CSS. Pick a scale. See violations and token opportunities live. Share a URL that preserves your input.

It runs entirely client-side. No upload, no account, no install. It supports `@theme` token extraction for Tailwind v4 out of the box.

## If it lands for your project

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
npx rhythmguard audit ./src
```

The CLI outputs the same histogram format as above — paste it in a PR description, your team lead will get it in one glance.

GitHub: [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard)
npm: `stylelint-plugin-rhythmguard`

---

*Curious what the rest of the ecosystem looks like. If you run the audit on a public codebase and find something surprising, drop it in the comments.*
