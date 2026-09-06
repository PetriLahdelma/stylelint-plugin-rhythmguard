# Spacing scale audit: 58 literal spacing values off your own token scale

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `7c9eaba` over `apps/v4/app`, `apps/v4/registry`, `apps/v4/components`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale `0, 1.6, 1.778, 3.2, 3.555, 3.556, 4.8, 5.333, 6.4, 7.11, 7.111, 8, 8.888, 8.889, 9.6, 10.666, 10.667, 11.2, 12.443, 12.444, 12.8, 14.221, 14.222, 16, 17.776, 17.778, 19.2, 21.331, 21.333, 22.4, 24.886, 24.889, 25.6, 28.442, 28.444, 28.8, 31.997, 32, 35.2, 35.552, 35.556, 38.4, 39.107, 39.111, 42.662, 42.667, 44.8, 49.773, 49.778, 51.2, 56.883, 56.889, 64, 71.104, 71.111, 76.8, 85.325, 85.333, 89.6, 99.546, 99.555, 102.4, 113.766, 113.778, 115.2, 127.987, 128, 140.8, 142.208, 142.222, 153.6, 156.429, 156.444, 166.4, 170.65, 170.666, 179.2, 184.87, 184.889, 192, 199.091, 199.111, 204.8, 213.312, 213.333, 227.533, 227.555, 230.4, 255.974, 256, 284.416, 284.444, 307.2, 341.299, 341.333` inferred from your own spacing tokens in the stylesheets. 58 literal spacing values are off that scale.

- Values: `-2.5rem` ×8, `2.5rem` ×8, `2px` ×5, `-5px` ×4, `0.25em` ×4
- Properties: `class-string` ×47, `padding` ×6, `margin-block-start` ×2, `padding-inline-start` ×2, `padding-block` ×1

Three values usually explain most of the count, and each is a single decision: a step the scale is missing, a slip, or a token nobody defined. A property table led by sibling margins often means the parent could own the spacing with `gap`.

**The ask.** Nothing is required. If the numbers are useful, I can open a small PR for the top value with before and after screenshots, or a one-rule Stylelint config at warning level that reports new off-scale values against your tokens and nothing else. If the findings are wrong for this codebase, tell me which ones; false positives are the most valuable report the tool gets and they change its defaults.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
