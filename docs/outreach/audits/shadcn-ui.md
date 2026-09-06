# Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `7c9eaba` over `apps/v4/app`, `apps/v4/registry`, `apps/v4/components`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale inference picked up variables that do not form a spacing scale (it derived `0, 1.6, 1.778, 3.2, 3.555, 3.556, 4.8, 5.333, 6.4, 7.11, 7.111, 8, 8.888, 8.889, 9.6, 10.666, 10.667, 11.2, 12.443, 12.444, 12.8, 14.221, 14.222, 16, 17.776, 17.778, 19.2, 21.331, 21.333, 22.4, 24.886, 24.889, 25.6, 28.442, 28.444, 28.8, 31.997, 32, 35.2, 35.552, 35.556, 38.4, 39.107, 39.111, 42.662, 42.667, 44.8, 49.773, 49.778, 51.2, 56.883, 56.889, 64, 71.104, 71.111, 76.8, 85.325, 85.333, 89.6, 99.546, 99.555, 102.4, 113.766, 113.778, 115.2, 127.987, 128, 140.8, 142.208, 142.222, 153.6, 156.429, 156.444, 166.4, 170.65, 170.666, 179.2, 184.87, 184.889, 192, 199.091, 199.111, 204.8, 213.312, 213.333, 227.533, 227.555, 230.4, 255.974, 256, 284.416, 284.444, 307.2, 341.299, 341.333` from `apps/v4/app/legacy-themes.css`, `apps/v4/registry/styles/style-luma.css` and others), most likely component-local spacing variables rather than your tokens. Measured against that, it reported 58 values, which is my tool's mistake and not a number I will quote.

**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to prefer it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
