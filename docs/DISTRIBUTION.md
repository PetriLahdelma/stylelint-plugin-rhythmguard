# Where Rhythmguard is listed

Kept current so the descriptions people meet elsewhere match the product.

## Listings we maintain

| Place | Text | Status |
| --- | --- | --- |
| GitHub about | "Nobody chose 13px. Catches off-scale spacing in CSS and Tailwind and snaps it to your scale." | current |
| npm description | same first sentence, plus what ships (Stylelint rules, ESLint companion, audit CLI) | current from the next publish; the npm page shows the README of the last published version |
| Browser playground | `docs/index.html` on GitHub Pages | updated alongside the README |
| GitHub Marketplace | [Rhythmguard Audit](https://github.com/marketplace/actions/rhythmguard-audit), from `PetriLahdelma/rhythmguard-action` v1.1.1: "Check CSS, SCSS and Tailwind spacing against your scale, annotate the diff, and fail on new drift against a baseline." Categories: Code quality, Continuous integration | listed 2026-11-05; the description is `action.yml`'s and must stay under 125 characters |

## Listings maintained by others

| Place | Entry | Assessment |
| --- | --- | --- |
| [stylelint/awesome-stylelint](https://github.com/stylelint/awesome-stylelint) (mirrored on stylelint.io) | "Enforce spacing scales and design token usage across CSS and Tailwind class strings (Pack)". Added by [#114](https://github.com/stylelint/awesome-stylelint/pull/114), merged 2026-05-03. | Accurate. The list keeps descriptions terse; a change would only be worth a PR if the scope changes (for example to mention SCSS), and the maintainers decide wording. |
| Research notes and skill files in other repositories | Cite Rhythmguard as the spacing-scale gate in agent-guardrail setups | Not ours to edit. The README now states what the tool is not, which is the correction one of them had to write. |
| Automated catalogues (for example `Arnon-hs/open-source`) | Scrape the GitHub about text | Refresh on their own schedule. |

## History

- 2026-02-17: [awesome-stylelint#109](https://github.com/stylelint/awesome-stylelint/pull/109) opened; closed 2026-05-03 in favour of #114. A duplicate, #110, was closed.
- 2026-02-21: cross-link PRs to `stylelint-plugin-defensive-css` ([#152](https://github.com/yuschick/stylelint-plugin-defensive-css/pull/152)) and `stylelint-plugin-logical-css` ([#123](https://github.com/yuschick/stylelint-plugin-logical-css/pull/123)) were closed without merge. No further cross-link requests are planned.
- 2026-04-28: Show HN, 1 point, no comments.
- 2026-05-03: awesome-stylelint listing merged.
