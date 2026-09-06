# Spacing scale audit: 5 literal spacing values off your own token scale

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `be40d3f` over `scss`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale `0, 4, 8, 16, 24, 48` inferred from your own spacing tokens in the stylesheets. 5 literal spacing values are off that scale.

- Values: `-.375rem` ×2, `.1rem` ×1, `2px` ×1, `2rem` ×1
- Properties: `margin-inline-start` ×2, `margin-bottom` ×1, `margin-top` ×1, `padding-inline-start` ×1

Three values usually explain most of the count, and each is a single decision: a step the scale is missing, a slip, or a token nobody defined. A property table led by sibling margins often means the parent could own the spacing with `gap`.

**The ask.** Nothing is required. If the numbers are useful, I can open a small PR for the top value with before and after screenshots, or a one-rule Stylelint config at warning level that reports new off-scale values against your tokens and nothing else. If the findings are wrong for this codebase, tell me which ones; false positives are the most valuable report the tool gets and they change its defaults.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
