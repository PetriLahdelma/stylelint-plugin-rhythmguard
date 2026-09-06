# Spacing scale audit: 2 literal spacing values off your own token scale

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `8bed560` over `packages/semi-foundation`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale `0, 0.4, 0.7, 0.8, 1, 1.1, 1.4, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 34, 36, 40, 48, 50, 52, 60, 64, 68, 80, 100, 120, 132, 280` inferred from your own spacing tokens in the stylesheets. 2 literal spacing values are off that scale.

- Values: `0.8em` ×1, `3.8em` ×1
- Properties: `padding-left` ×1, `padding-right` ×1

Three values usually explain most of the count, and each is a single decision: a step the scale is missing, a slip, or a token nobody defined. A property table led by sibling margins often means the parent could own the spacing with `gap`.

**The ask.** Nothing is required. If the numbers are useful, I can open a small PR for the top value with before and after screenshots, or a one-rule Stylelint config at warning level that reports new off-scale values against your tokens and nothing else. If the findings are wrong for this codebase, tell me which ones; false positives are the most valuable report the tool gets and they change its defaults.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
