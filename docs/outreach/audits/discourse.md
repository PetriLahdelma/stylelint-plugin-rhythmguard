# Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `c7b7a0b` over `app/assets/stylesheets`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** Scale inference picked up variables that do not form a spacing scale (it derived `0, 1, 1.3, 2, 3, 4, 5, 5.28, 6, 7, 8, 9, 9.28, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384` from `app/assets/stylesheets/admin/schema_setting_editor.scss`, `app/assets/stylesheets/common/base/discourse.scss` and others), most likely component-local spacing variables rather than your tokens. Measured against that, it reported 349 values, which is my tool's mistake and not a number I will quote.

**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to prefer it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
