# Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `3862b09` over `packages/@mantine/core/src`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale inference picked up variables that do not form a spacing scale (it derived `0, 1, 2, 10, 12, 16, 20, 22, 32` from `packages/@mantine/core/src/components/Avatar/Avatar.module.css`, `packages/@mantine/core/src/components/Chip/Chip.module.css` and others), most likely component-local spacing variables rather than your tokens. Measured against that, it reported 30 values, which is my tool's mistake and not a number I will quote.

**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to prefer it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
