# Spacing scale audit: 349 literal spacing values off your own token scale

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `c7b7a0b` over `app/assets/stylesheets`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale `0, 1, 1.3, 2, 3, 4, 5, 5.28, 6, 7, 8, 9, 9.28, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384` inferred from your own spacing tokens in the stylesheets. 349 literal spacing values are off that scale.

- Values: `0.15em` ×38, `15px` ×34, `0.35em` ×27, `0.2em` ×20, `0.1em` ×19
- Properties: `padding` ×130, `margin-top` ×34, `margin` ×33, `margin-left` ×29, `gap` ×26

Three values usually explain most of the count, and each is a single decision: a step the scale is missing, a slip, or a token nobody defined. A property table led by sibling margins often means the parent could own the spacing with `gap`.

**The ask.** Nothing is required. If the numbers are useful, I can open a small PR for the top value with before and after screenshots, or a one-rule Stylelint config at warning level that reports new off-scale values against your tokens and nothing else. If the findings are wrong for this codebase, tell me which ones; false positives are the most valuable report the tool gets and they change its defaults.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
