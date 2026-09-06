# Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `8bed560` over `packages/semi-foundation`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale inference picked up variables that do not form a spacing scale (it derived `0, 0.4, 0.7, 0.8, 1, 1.1, 1.4, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 34, 36, 40, 48, 50, 52, 60, 64, 68, 80, 100, 120, 132, 280` from `packages/semi-foundation/aiChatDialogue/variables.scss`, `packages/semi-foundation/aiChatInput/variables.scss` and others), most likely component-local spacing variables rather than your tokens. Measured against that, it reported 2 values, which is my tool's mistake and not a number I will quote.

**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to prefer it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
