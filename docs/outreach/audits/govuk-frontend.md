# Spacing scale: where do your spacing tokens live? (audit from the Rhythmguard benchmark)

Hi. I maintain [stylelint-plugin-rhythmguard](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard), a Stylelint rule that checks spacing values against a project's own scale. To keep it quiet on code I do not control, I run it against public design systems on pinned commits and publish the numbers. This repository is one of them, and I would rather you saw the audit here than in a report first.

**What was run.** `npx rhythmguard audit . --scale auto` at `356d461` over `packages/govuk-frontend/src/govuk`. Hairlines of one pixel or less, percentages, and generated or test paths are excluded. Anyone can reproduce it in a checkout of that commit.

**What it found.** The audit could not find a spacing token set here (it looks for `--space-*` / `--spacing-*` custom properties, Sass `$spacer` / `$spacing-*` variables and maps, or a Tailwind `--spacing` base), so it measured against a default 4px scale instead. Against that default it reported 21 literal values, a number that says more about my token discovery than about your CSS, so I am not treating it as a finding.

**The ask.** If you can point me at where the spacing scale is defined (a token file, a Sass map, a package), I will teach the tool to read it, re-run the audit on the real scale, and post the result here. If spacing is intentionally not on a scale, saying so is just as useful and I will mark the row that way.

The row for this repository will appear in a periodic "State of Spacing" table in the Rhythmguard repository, with this issue linked. If you would rather not be listed, say so here and I will remove it.

Feel free to close this if it is not useful. Thanks for the CSS.
