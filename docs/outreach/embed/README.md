# Shared-config round (strategy B4), drafted 2026-09-23

The first outreach round asked design-system repositories to check an audit of their own code. This round asks the maintainers of shared Stylelint configs to add one warning-level rule that their consumers install. Different ask, different audience, and a different message: each draft leads with what the config's own consumers do, in their files, and puts the tool last. That is the correction from materializecss/materialize#665, where the templated audit issue was met with "What is this?".

Nothing here has been posted. Each draft is confirmed one at a time before it leaves this machine, and every outcome goes in [`../embed-log.md`](../embed-log.md).

## Ranking and preconditions

| Order | Config | Repo | Consumers audited | Posting precondition |
| --- | --- | --- | --- | --- |
| 1 | `stylelint-config-twbs-bootstrap` | twbs/stylelint-config-twbs-bootstrap | materialstyle (33 off its own `$spacers`), bootstrap-v4-rtl (15), Bootswatch theme SCSS (31) | Decision: twbs/bootstrap#42907 got no maintainer reply, only a community reviewer who offered to add the rule. Same org, different repo. Your call under the no-follow-up rule. |
| 2 | `@primer/stylelint-config` | primer/stylelint-config | mahogany (142 off its own layout scale), ARKA (4) | None. Primer maintainers replied in primer/css#3166 and primer/react#8387; `@primer/primitives` is on the allowlist. |
| 3 | `@wordpress/stylelint-config` | WordPress/gutenberg (`packages/stylelint-config`) | ghostkit (199, default scale), formidable-forms (1062, default scale) | Teach inference WordPress's `$grid-unit-*` first, or the pitch measures consumers against a scale WordPress did not choose. Also WordPress/gutenberg#82502 got no reply, so this is a re-contact. |
| 4 | `stylelint-config-wikimedia` | wikimedia/stylelint-config-wikimedia | Liquipedia/Lua-Modules (464, default scale) | Add `@wikimedia/codex-design-tokens` (`--spacing-*`) to the token-package allowlist first. Most Wikimedia consumers are Less, which the audit does not scan; say so in the issue. |
| 5 | `@gitlab/stylelint-config` | gitlab.com gitlab-org/frontend/gitlab-stylelint-config | gitlab-ui (3, default scale) | Teach inference `$gl-spacing-scale-N` scalars first (`src/scss/variables.scss` in gitlab-ui). Post by hand on gitlab.com. No independent consumers on GitHub. |
| 6 | `@10up/stylelint-config` | 10up/10up-toolkit (`packages/stylelint-config`) | zammad-wp (15, default scale) | Low value: independent consumers are 2023 to 2025 and small. Post last, if at all. |

Skipped, with the reason:

- `@taiga-ui/stylelint-config`: Taiga UI itself and its consumers are Less codebases (9 SCSS files in `projects/`, 0 findings); the audit does not scan `.less`. Less support is the precondition and is a product decision, not an outreach one.
- `@jetbrains/stylelint-config`: the config repository has not been touched since October 2023 and pins `stylelint-config-standard` 34; its consumers are YouTrack widget demos.
- `@lucca/stylelint-config-prisme`: no consumer outside LuccaSA.

## What the audits taught the tool

- Two consumer audits threw because the project's own `.stylelintignore` excluded every file; the audit now counts those files instead (`scanned.stylelintIgnored`, #160).
- One consumer's vendored Ace editor file held the audit for eleven hours (exponential backtracking in the class-string scanner, fixed in #160).
- The first finding in gitlabhq, WooCommerce, Transmission and BootstrapMediaWiki is in a vendored or compiled file (`cropper.css`, `jquery-ui`, a built bundle, Font Awesome). The audit has no non-authored heuristic of its own; the benchmark's `noise:non-authored` path rule should move into the audit as a default ignore. Filed as #161.
- Two ecosystems on the list write Less. Nothing in Rhythmguard reads it.
