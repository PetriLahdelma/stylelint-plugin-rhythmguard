---
title: I ran a spacing audit on shadcn/ui. Even it has drift.
published: false
tags: tailwindcss, css, designsystems, webdev
cover_image: https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-cover.svg?v=1
---

Short post. Three things to share.

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

## The audit CLI

If the playground convinces you, the CLI is where you actually run it on real code.

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
npx rhythmguard audit ./src
```

You get the same histogram format I showed above — but for your codebase:

```
  ┌─ RHYTHMGUARD AUDIT ─────────────────────────────────────────┐
  │  ./src                                                      │
  └─────────────────────────────────────────────────────────────┘

  Files scanned        127
  Files with issues     48  (38%)
  Scale cleanliness   ████████████░░░░░░░░  62%

  ── OFF-SCALE VALUES ──  183 total

  13px           ██████████████████████████████ 47
  7px            █████████████████████░░░░░░░░░ 33
  15px           ██████████████░░░░░░░░░░░░░░░░ 22
  11px           ████████░░░░░░░░░░░░░░░░░░░░░░ 13
  ...

  ── TOKEN OPPORTUNITIES ──  94 total

  16px           ██████████████████████████████ 38
  8px            █████████████████░░░░░░░░░░░░░ 22
  24px           ███████████░░░░░░░░░░░░░░░░░░░ 14
  ...

  → Run "npx stylelint --fix" to auto-correct.
  → Paste this output in a PR to make the case for adoption.
```

Three things I care about in this output:

1. **Scale cleanliness score.** One number a team lead can react to. "We're at 62%. Let's get to 95%." That's a quarter-level goal anyone can understand.
2. **Proportional histogram.** You instantly see which off-scale values are pervasive versus one-off. `13px` appearing 47 times is systemic; `0.625rem` once is a refactor.
3. **PR-ready.** The box-drawing characters render in GitHub comments, Slack, and terminals. No screenshots needed. Copy-paste, ship the case for adoption.

There's also `--json` for CI:

```bash
npx rhythmguard audit ./src --json > audit.json
```

And two companion commands:

```bash
npx rhythmguard init     # detect your stack, write .stylelintrc.json
npx rhythmguard doctor   # validate your setup with fix suggestions
```

All three are pure Node — no extra dependencies.

## Recap

- The [shadcn audit](https://gist.github.com/PetriLahdelma/2ad44d6dc2022f48c67f839c6440745c) shows even disciplined codebases leak through Tailwind arbitrary values.
- The [playground](https://petrilahdelma.github.io/stylelint-plugin-rhythmguard/) lets you try it without installing anything.
- The [audit CLI](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard) gives you a shareable score and histogram for your codebase.

GitHub: [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard)
npm: `stylelint-plugin-rhythmguard`

---

*Curious what the rest of the ecosystem looks like. If you run the audit on a public codebase and find something surprising, drop it in the comments.*
