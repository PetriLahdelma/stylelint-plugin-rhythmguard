# Changelog

All notable changes to `stylelint-plugin-rhythmguard` will be documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [Unreleased]

### Changed

- Tested on Node 24 and 26 (with Stylelint 17) in addition to Node 20 and 22, and the ESLint companion rules on ESLint 9 as well as 10. A weekly job runs the full suite against Stylelint `next`; 18.0.0-next.0 passes. Peer ranges are unchanged.
- A release run now fails unless all three packages (`stylelint-plugin-rhythmguard`, `rhythmguard`, `eslint-plugin-rhythmguard`) are on npm at the release version.
- Feature freeze until 4.0, recorded in `CONTRIBUTING.md` and `ROADMAP.md`; the 2026-10-18 council report is in `docs/COUNCIL_2027-2028.md`. Contributors get `npm run check`, an `.nvmrc`, a dev container for Codespaces, and Discussions for questions.
- Ionic Framework is no longer in the quiet benchmark or the State of Spacing 2026-09 edition, at the maintainers' request (ionic-team/ionic-framework#31430). The edition now covers 57 repositories: 7972 off-scale values in 8362 CSS files.

## [3.14.0] - 2026-10-19

### Added

- A configured token source that yields no spacing tokens is a warning, whatever its format. A DTCG file holding only colors, a stylesheet with no custom properties, or a design-tool export whose group is called `dimension` gave `0` tokens and a silent fallback scale. Each `--token-source` and `audit.tokenSources` file that parses but yields nothing now carries `Token source <file> (<format>) yielded no spacing tokens; ...` in the audit's token source report (`contracts.tokens.sources[].warnings` in JSON, the Markdown Token Sources table, and a `!` line under the source in the text output, which now prints every token source warning there), and `rhythmguard doctor` prints the same as a `!` warning line that does not fail the run, along with any parse or skip warning the audit would give for that file. With `--token-kind` the warning names that kind. Stylesheets found by the scan and installed token packages are not configured sources and get no such warning. `parseTokenSources` takes `warnWhenEmpty: true` for the same check; it is off by default. ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163))
- The DTCG group's 2025.10 conformance fixtures for dimensions and dimension references run in the unit tests, vendored under `test/fixtures/dtcg-test-suite/` from design-tokens/community-group at `8e43819` (W3C 3-clause BSD License). They are not part of the npm package. ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163))

### Fixed

- DTCG token sources read the rest of the 2025.10 dimension forms the conformance suite covers. A `$ref` token (`"$ref": "#/base/$value/fontSize"`) was dropped without a word; it is now read through its JSON Pointer within the file, so a pointer to a `{ value, unit }` dimension gives that length. A `$ref` that names nothing, or a `dimension` token pointing at a bare number, is skipped with a warning; one pointing at a color or a composite is not a length and is left out as a color `$value` is. A dimension object without a number `value` and a `unit` (`{ "value": "16", "unit": "px" }`, `{ "unit": "px" }`) was dropped silently and is now skipped with a warning naming the token. Only files with such tokens read differently: a `$ref` spacing token can now move an inferred scale. ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163))

### Messages

- New token source warning (audit and `rhythmguard doctor`): `Token source <file> (<format>) yielded no spacing tokens; spacing tokens are read by name (space, spacing or spacer), so set a tokenPattern on this source if its tokens are named otherwise.`; with another `--token-kind`, `Token source <file> (<format>) yielded no <kind> tokens.`; with `--token-kind all`, `... yielded no tokens.`; for a source with its own `tokenPattern`, `... yielded no tokens matching tokenPattern "<pattern>".`
- New skip reasons in `Token source <file>: skipped <token> (<reason>).`: `dimension needs a number "value" and a "unit"`, `reference "<pointer>" does not resolve`, `reference "<pointer>" is a number, not a dimension`, `reference cycle through "<pointer>"`.
- `rhythmguard doctor` prints warnings as `! <warning>` lines, and its summary reads `All checks passed (N warnings).` or `N issues found (N warnings).` when there are any; without warnings it is unchanged.

## [3.13.0] - 2026-10-18

### Fixed

- `checkMathBounds` checks bounds inside translations. `use-scale`, `prefer-token` and `no-offscale-transform` skipped it for `transform`, so `transform: translateX(clamp(13px, 2vw, 17px))` gave no finding while `padding: clamp(13px, 2vw, 17px)` reported both bounds; `no-offscale-transform` accepted the option but ignored it everywhere, the `translate` properties included. The `clamp()` minimum and maximum and the length arguments of `min()` and `max()` are now checked, named and fixed in translate functions and in `translate`, `translate-x`, `translate-y` and `translate-z` as anywhere else. Only configs that set `checkMathBounds: true` see new reports. ([#272](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/272))
- Option shapes that turned a rule into a silent no-op are invalid options now. `scale: ["auto"]`, an empty `scale` or `customScale`, an empty list or an unknown preset in `scales` or `propertyScales` (`{ spacing: [] }`, `{ padding: { preset: "nope" } }`), and `use-motion-scale`'s `durationScale: 100`, `durationScale: []` or `durationUnits: "s"` were accepted and then checked nothing or fell back to the defaults; each is now an invalid option warning, which fails the Stylelint run as a misspelled option does. `"auto"` stays valid as the whole `scale`. A preset name as a `propertyScales` value (`{ padding: "rhythmic-8" }`), typed `scaleOrPreset` in the docs, was rejected and is accepted now. `audit.scales` in `.rhythmguardrc.json` uses the same check, so an empty list or unknown preset there is refused with `scales must map ...`. ([#273](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/273))
- `use-scale` and `no-offscale-transform` say why a negative value or a percentage is reported. With `allowNegative: false` or `allowPercentages: false` the message read `Use scale values (nearest: n/a).`, although `-8px` is on the scale. It now reads `Negative values are disabled for this rule.` or `Percentages are disabled for this rule.`, as `tailwind-class-use-scale` already does; see Messages. What is reported is unchanged. ([#274](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/274))
- `prefer-token` finds a px `tokenMap` key for a converted length. The key was built from the raw conversion, so `padding: 1.1rem` at `baseFontSize: 14` looked up `15.400000000000002px`, missed `"15.4px": "var(--space-x)"` and read `No known token holds this value`. The key is now formatted like every other length, so the value reads `Use var(--space-x).` and is fixed to it. This changes the message and adds a fix for such values. ([#275](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/275))
- The `use-motion-scale` docs print the rule's messages. They showed `Use motion scale values` and `Use an easing token.`, while the rule reports `Use duration scale values (nearest: 150ms or 200ms).` and `Use motion tokens for easing decisions.`; the docs now match, and a test lints the documented example against them. The messages are unchanged. ([#276](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/276))
- A file saved with a UTF-8 byte order mark is read like one without. A JSON token source with a BOM failed with `Unable to parse token source ...: Unexpected token`, a `.rhythmguardrc.json` with one was ignored by the lint (`.rhythmguardrc.json could not be read`) and stopped the audit with `Invalid Rhythmguard config`, and a baseline with one stopped `--since-baseline`. A leading BOM is now stripped before parsing token sources (JSON and CSS), `.rhythmguardrc.json` in the lint, the audit and `rhythmguard doctor`, `tokenMapFile`, and baselines. ([#291](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/291))
- A bare `--space` is a spacing base only when the other spacing tokens do not form a scale on their own. `:root { --space: 1rem; --space-s: .5rem; --space-m: 1rem; --space-l: 2rem; --space-xl: 3rem }` with `scale: "auto"` gave multiples of 16px up to 1536px, so 40px and 56px passed while 12px was reported against 16px steps; that ladder is now the scale and `--space` one step on it. A project that declares `--space: 0.25rem` and writes each step as `calc(var(--space) * N)`, as Discourse does, keeps the multiples, since its steps are not plain lengths. `--spacing` (Tailwind v4) is always a base. ([#293](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/293))
- Audit token ladders compare a ladder of negative steps by magnitude. `--space-negative-1: -4px` to `--space-negative-3: -16px` was reported as two `inverted` problems; a ladder whose every step is negative is now compared by magnitude, and a ladder that crosses zero keeps its signed order. ([#294](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/294))
- Audit token chains no longer count shadow tokens as spacing tokens. `inset` in Tailwind v4's `--inset-shadow-*` made them spacing-named, so a Tailwind `theme.css` added three `non-length` chains and read "1 of 4 spacing tokens resolve". Names containing `shadow` are now left out of the chains. ([#295](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/295))
- An explicit `tokenPattern` now selects the tokens `scale: "auto"` reads from token files, as it already did for `fixWith: "token"`. With `{ scale: "auto", tokenPattern: "^--size-", scaleSources: ["sizes.css"] }` and `--size-1` to `--size-4` in that file, inference found nothing and fell back to `rhythmic-4`, while fixes wrote the `--size-*` tokens. The pattern is now applied to `scaleSources`, `.rhythmguardrc.json` token sources and installed token packages on top of the spacing names, unless a source sets its own `tokenPattern`, so inference and fixes read the same tokens. This changes the inferred scale for configs that set both `scale: "auto"` and `tokenPattern` when a token file has tokens the pattern matches but the spacing names do not. ([#296](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/296))
- The docs list the `scale: "auto"` sources in the order the code reads them: `tailwindConfigPath` comes before installed token packages. `docs/rules/use-scale.md` and `docs/FOR_CONFIG_AUTHORS.md` had them the other way round. The order itself is unchanged. ([#297](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/297))
- `tailwind-class-use-scale` keeps the sign of a double negative. In `-m-[-13px]` the two signs cancel and Tailwind writes `margin: 13px`, but the rule treated either sign as making the value negative, so the fix wrote `-m-3` (-12px) and the message named `-m-3` or `-m-4`. The value is now negative only when exactly one of the two signs is there, so `-m-[-13px]` becomes `m-3`; with `spacingUnit: false` it still becomes `-m-[-12px]`, and with `allowNegative: false` a double negative is checked like any positive value instead of being reported as negative. The audit's class-string findings change the same way. ([#277](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/277))
- `eslint --fix-type` applies the Rhythmguard fixes. Neither ESLint rule declared `meta.type`, and ESLint skips the fixes of a rule without one whenever `--fix-type` is given, so `--fix-type problem,suggestion,layout` fixed nothing. Both rules are now `type: "suggestion"`. ([#278](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/278))
- The ESLint `configs.recommended` works as a flat config of its own. It had only `rules`, so `export default [rhythmguard.configs.recommended]` failed with `could not find plugin "rhythmguard-tailwind"`. It now also has `plugins: { "rhythmguard-tailwind": plugin }`; spreading `configs.recommended.rules` into a block that registers the plugin works as before. ([#279](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/279))
- The Stylelint option types accept the package's own configs. `RhythmguardRuleOptions` lacked most options, so typing the shipped `embed` config failed on `severity` and `motion` on `durationScale`. The types now have every option each rule accepts, as `RhythmguardUseScaleOptions`, `RhythmguardPreferTokenOptions`, `RhythmguardTransformRuleOptions` and `RhythmguardMotionRuleOptions` (with `RhythmguardRuleOptions` covering all three length rules), Stylelint's own `severity`, `message`, `disableFix`, `reportDisables` and `url`, and the `[true]` form. `rules` in `RhythmguardStylelintConfig` types each Rhythmguard rule with its own options. `includeMathFunctions`, which no rule accepts, is gone from the types; use `enforceInsideMathFunctions`. Every shipped config now declares its type and is checked by `npm run typecheck`. ([#280](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/280))
- Smaller type and playground mismatches. `getScalePreset` and `getCommunityScaleMetadata` are typed as returning `null` for an unknown name, which is what they return. The subpath types (`stylelint-plugin-rhythmguard/eslint`, `/audit`, `/presets`, `/configs/*`, `/rules/*`, `/cli`) resolve under `moduleResolution: "node"` through `typesVersions`, and `eslint-plugin-rhythmguard`'s types import the package root, so they no longer fail with `TS2307`. The playground's `tailwind` config includes the `strict` config it extends, so it runs `use-scale` and `no-offscale-transform` as Stylelint does, not only `prefer-token`. ([#281](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/281))
- The audit API types match the report. `AuditSummary` declared `cleanliness`, `filesWithFindings` and `findingCount`, `AuditFinding` declared `message`, `AuditBaselineComparison` declared `resolvedFindings`, and `config` was typed as a string; the report has `scaleCleanliness`, `filesWithIssues`, `totalFindings`, `text`, `resolvedFindingsCount` and `config: { file }`. The types now describe the report as `createAuditReport` returns it, `AuditOptions` marks `format`, `outputPath`, `maxFindings`, `minCleanliness`, `failOnNewDrift` and `badgeMetric` as CLI only (`createAuditReport` never read them), and `loadAuditConfig` has its real return type. `createAuditReport({ scale: undefined })` used the undefined over the default scale and inferred one from the scanned CSS; a key set to `undefined` now counts as omitted, so the default or the config file value applies. ([#284](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/284))
- Numeric audit flags refuse empty, whitespace and non-decimal values. `--min-cleanliness=` (an unset `$THRESHOLD` in CI) gated at 0% and passed, `--max-findings=` became 0, and `--max-findings 0x10` became 16, because each value went through `Number()`. `--max-findings`, `--min-cleanliness`, `--token-candidate-min-count` and `--base-font-size` (also on `rhythmguard fix`) now take plain decimal digits only, with a fraction where one makes sense, and exit 1 with their existing message otherwise. In `.rhythmguardrc.json` a JSON number or a decimal string is accepted as before; `null` and `true`, which read as 0 and 1, are refused. ([#282](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/282))
- `audit.scales` reaches `--plan` and the reported scale. With `{"scales":{"spacing":[0,5,10],"typography":[12,14,16]}}`, `--plan` proposed `margin: 8px` with `"nearest": ["8px","8px"]` and `font-size: 15px` with `["12px","16px"]`, taken from the project scale, and `contracts.scale.values` still read `0, 4, 8, ..., 32`. A `spacing` list or preset is now the audit's spacing scale (`source: "explicit"`), as it already was for `use-scale`; `--plan` takes each value's nearest steps from the scale it was checked against, gives a value found in groups with different scales one entry per scale, and leaves `nearest` empty for a group set to `"auto"`. Token opportunities, Tailwind class strings and token chains now read the `spacing` entry too, so this changes findings for configs that set `audit.scales.spacing`. ([#283](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/283))
- Markdown reports keep their tables and code spans intact. A scale source file named `a|b.css` split the `Scale source` row, and a file named ``we`ird.css`` broke out of its code span, since a backslash escapes nothing inside a code span. The scale source row is escaped now, and code spans use a fence one backtick longer than any run in the value; token names, chain terminals, ladder steps and the directory line get the same treatment. ([#285](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/285))
- `init --help`, `doctor --help` and `quickstart --help` print their usage. `echo y | rhythmguard init --help` wrote `.stylelintrc.json`, doctor ran its checks, quickstart audited, and a typo such as `init --agnets claude` fell through to the interactive init. Every command now handles `--help` and `-h` and refuses an option it does not know before doing anything; `init --agents` with no value still means `all`. ([#286](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/286))
- The audit commands quickstart suggests reproduce its result. Quickstart audits with `--scale auto` and the token files it finds, but suggested `npx rhythmguard audit . --format markdown`, which used the default scale: with a `tokens.json` scale of `0, 4, 8, 12, 20`, quickstart reported `16px` and the suggested audit and baseline reported `20px`. The suggested commands now carry the same flags, for example `npx rhythmguard audit . --scale auto --token-source ./tokens.json --format markdown`. ([#287](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/287))
- `rhythmguard fix` checks its target and reports where each literal is. `fix ./nope` and `fix ./a.css` ended in a raw `binding.readdir` stack trace; they now exit 1 with the audit's `Directory not found: ./nope` and `Not a directory: ./a.css`. A literal in a value that spans lines was listed at the declaration's line with a column past its end (`2:24` for a `10px` on line 4); positions are now counted through the value. ([#288](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/288))
- The audit follows symbolic links. A linked directory or stylesheet was skipped without a word (`cssFiles: 1` and no findings for `src/linked -> ../real` and `src/l.css -> ../real/r.css`), in a full run and with `--staged`. Links that resolve inside the audited directory are now followed, a link back up the tree is not walked twice, and a file reached by more than one path is scanned once, under its own path when the walk reaches it directly. Security: a link that resolves outside the directory (`../../other-project`, `/etc`) is never followed, in a full run, with `--staged` and with `--since`, and is counted as `Links not followed` in text and Markdown output (`scanned.linksOutsideRoot` in the report); `rhythmguard fix` walks the same way and never writes through a symbolic link, so `fix --write` cannot rewrite a file outside the directory it was given. This adds findings for projects that link stylesheets into the audited directory. ([#289](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/289))
- A corrupt baseline names its file. `--since-baseline` with an invalid `.rhythmguard-baseline.json` failed with `Expected property name or '}' in JSON at position 1` alone; the error now reads `Invalid baseline file .rhythmguard-baseline.json: <the JSON error>`, also when a `--staged` or `--since` run merges into it. ([#290](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/290))

### Messages

- `use-scale`: with `allowNegative: false` a negative value reads `Unexpected value "-8px". Negative values are disabled for this rule.`, and with `allowPercentages: false` a percentage reads `Unexpected value "5%". Percentages are disabled for this rule.`, where both read `Unexpected off-scale value "...". Use scale values (nearest: n/a).` A `clamp()`, `min()` or `max()` bound names its position: `Unexpected clamp() minimum "-8px". Negative values are disabled for this rule.` ([#274](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/274))
- `no-offscale-transform`: the same cases read `Unexpected transform translation value "-8px". Negative values are disabled for this rule.` and `Unexpected transform translation value "13%". Percentages are disabled for this rule.` instead of `Use scale values (nearest: n/a).` A bound checked by `checkMathBounds` names its position, as in `use-scale`: `Unexpected transform translation clamp() minimum "13px". Use scale values (nearest: 12px or 16px).`, with the px value after a rem or em bound. ([#274](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/274), [#272](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/272))
- Audit: a baseline that is not valid JSON reads `Invalid baseline file <path>: <the JSON error>`. ([#290](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/290))
- `rhythmguard init`, `doctor` and `quickstart`: `--help` prints `Usage: rhythmguard init [options]`, `Usage: rhythmguard doctor` or `Usage: rhythmguard [quickstart]` with the options; an unknown option reads `Unknown option: <option>` followed by the usage, and `init --agents=` reads `Missing value for --agents.` ([#286](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/286))
- `rhythmguard fix`: a missing target reads `Directory not found: <path>` and a file `Not a directory: <path>`, as in the audit. ([#288](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/288))
- Audit: text output adds `Links not followed  <n>  (they point outside the scanned directory)` and Markdown `| Symbolic links not followed (they point outside the scanned directory) | <n> |` when a symbolic link resolves outside the scanned directory. `rhythmguard fix` lists `skipped <file>: symbolic link to a path outside the directory; not followed` and `skipped <file>: reached through a symbolic link; rewrite the file it points to instead`. ([#289](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/289))
- Quickstart: the `Next` section puts each note on its own line above its command (`PR-ready report:` then `npx rhythmguard audit . --scale auto ... --format markdown`), and the baseline note reads `Then gate only new drift in CI, with the same flags:`. ([#287](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/287))

## [3.12.0] - 2026-10-18

### Fixed

- `use-motion-scale` no longer snaps times inside `calc()`, `clamp()`, `min()` and `max()`. They are terms of an expression, so `transition-delay: calc(var(--i) * 30ms)` was reported and fixed to `calc(var(--i) * 0ms)`, removing the stagger, and `calc(var(--index) * 50ms + 100ms)` became `* 75ms`. They are now skipped, as `use-scale` skips them by default; times outside the math function in the same value are still checked. This removes reports for times inside math functions. ([#232](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/232))
- Negative delays are no longer reported as invalid. `use-motion-scale` rejected every negative time with `Unexpected negative motion duration "-100ms".`, including `transition-delay: -100ms` and the `-0.5s` delay in `animation: spin 1s -0.5s infinite`, which are valid CSS that start the motion partway through; `tailwind-class-use-motion-scale` did the same for `delay-[-100ms]`. A negative is now rejected only for a duration: `*-duration`, `duration-[...]`, and the first time of each layer in a `transition` or `animation` shorthand (not when a function such as `var()` comes before it, since that may be the duration). A negative delay is checked against the scale by its size and a fix keeps the sign, so `-130ms` is reported and becomes `-150ms`, while `-100ms` passes. ([#236](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/236))
- `tailwind-class-use-motion-scale` no longer flags token easings. Every `ease-[...]` was reported, including `ease-[var(--ease-out)]` and `ease-[--my-ease]`, the tokens its message asks for. Only raw curves (`cubic-bezier(`, `linear(`, `steps(`) are reported now, as in `use-motion-scale`; the same applies to `rhythmguard audit --include-motion`. This removes reports for `ease-[...]` values that are not raw curves. ([#245](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/245))
- `no-offscale-transform` accepts its documented `tokenPattern` and `tokenFunctions` options. Both were missing from its option schema, so `{ tokenPattern: "^--gap-" }` failed with `Invalid option name "tokenPattern"` and turned the rule off, and `fixWith: "token"` could only write `--space-*` tokens. Both are accepted now; `tokenPattern` picks the tokens `fixWith: "token"` writes, an invalid pattern is reported on the root instead of throwing, and a translation tokenized through one of `tokenFunctions` is skipped as in `use-scale`. With the defaults this skips the fallback of `var(--space-*, ...)`, so `translateX(var(--space-2, 13px))` is no longer reported. ([#237](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/237))
- `no-offscale-transform` reports what `allowNegative: false` and `allowPercentages: false` forbid. Both branches returned without a report, so `allowNegative: false` made `translateX(-8px)` pass instead of failing, and `translateX(13%)` passed with `allowPercentages: false`. They are now reported without a fix, as in `use-scale`: `Unexpected transform translation value "-8px". Use scale values (nearest: n/a).` Only configs that set either option to `false` see new reports. ([#238](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/238))
- The audit finds Tailwind classes in string literals nested inside another literal. After a literal closed, the scanner continued after it, so ``className={`flex ${on ? 'p-[13px]' : 'm-[15px]'}`}``, Vue `:class="{ 'p-[13px]': active }"` and `:class="[active ? 'px-[13px]' : '']"` gave no findings and Svelte `class="m-[15px] {on ? 'gap-[13px]' : ''}"` found only `m-[15px]`, while the ESLint rule reported them. Each literal's value is now scanned again for literals in the other quote kinds, which still reads every character at most three times. This changes reports: projects with such classes get new findings, and a baseline written by 3.11.0 counts them as new drift. ([#254](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/254))
- `rhythmguard doctor` agrees with the audit on `.rhythmguardrc.json`. It failed a decisions-only file with `audit config missing`, which the audit reads fine, and passed files the audit rejects, such as `{"audit":{"minCleanliness":150}}` or a decision with value `abc`. It now validates the `audit` section with the audit's own loader (which makes the section optional and checks every value, token source and the ignore file) and the `decisions` section with the same code the audit and the rules use, and reports each section's error as a failure. ([#255](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/255))
- `rhythmguard fix --decided` applies every snap decision once, to the original values. Each decision ran over the files the previous one had rewritten, so decisions `10px -> 14px` and `14px -> 16px` turned `padding: 10px` into `16px` on `--write`, while the dry run, reading the files unchanged, showed `14px`. All snaps now run in one pass: a value one snap writes is never snapped again, and the dry run lists exactly what `--write` writes. ([#256](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/256))
- `rhythmguard init` writes the config Stylelint loads. It always wrote `.stylelintrc.json`, which Stylelint never reads when `package.json` has a `stylelint` key or a `.stylelintrc` exists, so init reported `Wrote .stylelintrc.json` and nothing changed. Init now finds the config with Stylelint's search order (cosmiconfig's: `package.json`, `.stylelintrc`, `.stylelintrc.{json,yaml,yml,js,ts,cjs,mjs}`, `.config/stylelintrc*`, `stylelint.config.{js,ts,cjs,mjs}`). A JSON `.stylelintrc` or `.stylelintrc.json` is rewritten in place after the same prompts; for a `package.json` key, a YAML file or a JS or TS config, init writes nothing and prints the lines to add, in that file's syntax. ([#257](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/257))
- The token source cache no longer grows with every save. Parsed token sources were cached under a key that included each file's mtime and never evicted, so an editor or watch mode that re-linted after each edit kept every old parse: a 20k-token file edited 60 times took the heap from 4MB to 1152MB. The cache is now keyed by the source paths, keeps the mtimes in the entry and replaces it when a file changes; the same 60 edits stay at about 23MB. ([#264](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/264))
- The `scale: "auto"` fallback note names the token source that failed. A missing `scaleSources` file or one that does not parse read `No spacing tokens were found for scale "auto"; using preset "rhythmic-4".`, the same as a project without tokens. The note now adds the reason, for example `Token source not found: does-not-exist.css.` This changes the note for configs whose token sources fail; see Messages. ([#270](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/270))
- An unknown `format` in a token source no longer aborts the Stylelint run. In `scaleSources` it is now an invalid option warning; in `.rhythmguardrc.json` (`{"audit":{"tokenSources":[{"path":"tokens.css","format":"scss"}]}}`) the entry is skipped and the `scale: "auto"` fallback note names it, as it does for an rc file that is not valid JSON. The audit still stops on such an entry with `Invalid token source format "scss". ...`. An rc entry the audit rejects (no `path`, an empty `tokenPattern`) is now skipped by the lint too, where it used to be read with the pattern ignored. ([#265](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/265))
- Lint and audit read the same files from `.rhythmguardrc.json`. The lint honoured `baseDir` and `file` in `audit.tokenSources` entries; the audit ignored `baseDir` and refused `file` with `token source objects must include a path.` Both now read entries through one normaliser: `file` is another name for `path`, and `baseDir` resolves from the config file's directory. This changes the audit's scale for configs that set `baseDir`. ([#271](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/271))
- `scales: { spacing: "auto" }` next to an explicit `scale` uses `scale` when no spacing tokens are found, as the docs say. It used the `rhythmic-4` fallback, so with `scale: [0, 5, 10, 15, 20]` a `padding: 5px` was reported as `Use spacing scale values (nearest: 4px or 8px)`. This changes findings for configs without spacing tokens that set it. ([#261](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/261))
- Typography `"auto"` no longer reads Tailwind's sub-tokens such as `--text-sm--line-height: 20px` as font sizes, which put line heights on the type scale. Names with a second `--` after the prefix are left out. This changes findings for Tailwind v4 projects that set `scales: { typography: "auto" }`. ([#262](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/262))
- Audit token chains resolve through installed token packages and through tokens of any kind in token sources. Chains were resolved against token sources filtered to the spacing kind, without packages, so `--button-padding: var(--space-2)` with `@radix-ui/themes` installed, or `--card-gap: var(--size-8)` with `--size-8` in a token source, read `unresolved`. Those tokens are now looked up; they are not counted as chains of their own, so totals change only where a chain used to be unresolved. ([#259](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/259))
- `--token-kind` no longer changes the audit's spacing scale. With `--scale auto --token-kind radius`, spacing was checked against the radius tokens (`[0, 3, 6, 10, 14]`); token sources are now read once more for spacing tokens to build the scale, and `--token-kind` shapes the token contract only. ([#260](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/260))
- `tailwind-class-use-scale` with `allowNegative: false` reports the negative class form. Only a negative value inside the brackets counted, so `-m-[13px]` was reported as off-scale and fixed to `-m-3`, and `-m-[16px]` was not reported at all. `-m-[16px]` and `m-[-16px]` now both read `Negative values are disabled for this rule.`, with no fix. With `allowNegative: false`, negative classes that are on the scale are now reported; the default (`true`) reports nothing new. The audit's class-string scan uses the same analysis. ([#241](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/241))
- `tailwind-class-use-scale` names and writes utility classes for the configured root size. `spacingUnit` was 4px whatever `baseFontSize` said, so at `baseFontSize: 10` `p-[1.3rem]` was fixed to `p-3`, which is 7.5px at a 10px root. When `spacingUnit` is not set it is now `baseFontSize / 4` (Tailwind's `0.25rem` step, still 4px at the default 16), so that value is fixed to `p-[1.2rem]` and a scale of 2.5px multiples gets classes. `em` values keep the arbitrary form and their unit (`p-[1.1em]` becomes `p-[1em]`, not `p-4`), because a utility class is root-relative and an `em` value follows the element's font size. Configs with the default 16px root and px or rem values get the same fixes as before; an explicit `spacingUnit` is used as given. ([#247](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/247))
- `tailwind-class-use-scale` checks `class` attributes in Vue and Svelte templates. It visited only `Literal` and `TemplateElement`, so with vue-eslint-parser the `<template>` (a separate tree) was never seen, and with svelte-eslint-parser the static text of `class="..."` (a `SvelteLiteral`) was skipped, while the audit counted both. The rule now walks the Vue template through `parserServices.defineTemplateBodyVisitor` when the parser provides it, checking static `class` attributes and the strings in bound classes, and visits `SvelteLiteral` in `class` attributes. Both are fixed in place, with HTML entities kept as written. No new dependency: the code uses the parsers' node shapes only when they are present. ([#244](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/244))
- The ESLint plugin's TypeScript declarations are assignable to ESLint's `ESLint.Plugin` and `Linter.Config`, so a typed `eslint.config.ts` with `defineConfig` from `eslint/config` compiles. `configs.recommended.rules` allowed any `number` and rules returned `Record<string, unknown>`; severities are now `0 | 1 | 2 | "off" | "warn" | "error"` and `create` returns listener functions, with a typed `meta`. A typecheck fixture registers both `eslint-plugin-rhythmguard` and `stylelint-plugin-rhythmguard/eslint` through `defineConfig`. ([#242](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/242))
- The ESLint config samples lint JSX. The samples in the READMEs, `FRAMEWORKS.md`, `TAILWIND.md`, `COMPARISON.md`, the rule docs and the snippet quickstart prints had no `files` (so `npx eslint .` skipped `.jsx` and exited 0) or no JSX parsing (`Parsing error: Unexpected token <`). Each now sets `files: ['**/*.{js,jsx,mjs,cjs}']` and `languageOptions.parserOptions.ecmaFeatures.jsx`, and the package README has an "Other file types" note for TypeScript, Vue, Svelte and Astro parsers. A contract test runs every sample as an `eslint.config.js` against a `.jsx` file. ([#243](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/243))
- Quickstart and the docs no longer call the audit's fallback scale `rhythmic-4`. The audit and the ESLint rule fall back to `0, 4, 8, 12, 16, 24, 32`, while `rhythmic-4` goes on to 40, 48 and 64, so quickstart reported `margin: 40px` as off-scale and then suggested `scale: "auto"`, which falls back to `rhythmic-4` in Stylelint and passes it. On a fallback, quickstart now suggests the explicit scale it used, so the pasted config reports what quickstart reported, and the note reads `the audit's default scale is being used`. `AUDIT.md`, the ESLint rule docs and the benchmark write-ups name the actual default. The default scales themselves are unchanged; one default for the audit, the ESLint rule and the Stylelint rules changes reports and is planned for 4.0. ([#246](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/246))
- A CSS token file keeps the scope of each custom property. `scaleSources`, `--token-source` and token-package files dropped it, so `.chip { --chip-spacing: 3px }` in `tokens.css` joined the `:root` scale (`[0,3,4,8,16,24]`) and `padding: 3px` was not reported, although the same CSS in the linted stylesheet left it out. Component-local variables in a token file are now left out whenever the root tokens form a scale, as in the stylesheet. This can change the inferred scale, and so the findings, for a token file that declares component variables. ([#258](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/258))
- A CSS token file with an unquoted `url(https://...)`, such as `@import url(https://fonts.example.com/x.css);` before `:root`, yielded no tokens and no warning, because `//` was read as a line comment in every file and the rest of the line was skipped. `//` now starts a comment only outside plain `.css` files, and never right after `:` or `(`, so `https://` and `url(//cdn...)` stay values in SCSS too. Applies to token sources, the audit's scan of stylesheets and token chains. ([#263](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/263))
- A Sass variable declared inside a block no longer defines the scale. `$spacer: 8px` followed by `.compact { $spacer: 2px; }` made `$spacers` evaluate against 2px, so the scale became `[0,1,2,4,6]` and `padding: 16px` was reported. Scale inference now reads only top-level declarations and `!global` ones, in token files and in the linted SCSS file; declarations in rules, mixins, `@media` and `@if` blocks, mixin parameters and `@use ... with (...)` settings are left out. Several top-level declarations on one line are now all read; before, only the first was. Values in the linted file are still evaluated as before. This can change the inferred scale for Sass sources with block-local spacing variables. ([#266](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/266)) On the quiet benchmark this uncovers three findings that a block-local variable had hidden: `$link-underline-thickness * -1` (-3px) in govuk-frontend, and `$_header-item-padding` (12px) and `$_header-item-padding - 1px` (11px) in nhsuk-frontend, whose own scale has no 12px step.
- DTCG and Style Dictionary references resolve. A semantic token such as `"spacing.sm": { "$value": "{dimension.200}" }` or `"value": "{size.base.value}"` kept the reference text, so a DTCG file of aliases over primitives fell back to the default scale and a Style Dictionary alias was dropped from it. References are now followed within the file, through tokens of any name, before the spacing filter; a reference to a missing token or a cycle keeps its text and still counts as no length. ([#267](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/267))
- DTCG 2025.10 dimension objects are read. `"$value": { "value": 4, "unit": "px" }` was skipped, so a token file in the stable format yielded no tokens and the scale fell back without saying why. px and rem dimensions are now read (`4px`, `0.75rem`), references resolve through them, and a dimension in another unit is skipped with a warning that names the token. ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163))
- A non-zero token value without a unit is no longer read as px. `--space-ratio: 1.5` and `--spacing-scale: 3` put 1.5px and 3px on an inferred scale, and token chains reported them as `off-scale` with terminal `1.5px`; a DTCG `"$value": 1.5` or a Style Dictionary `"value": 4` did the same. They are now ratios, not lengths: left out of the scale and `non-length` in token chains. A unitless `0` is still a length, and flat JSON numbers (`{ "space-1": 4 }`) are still read as px. ([#268](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/268))
- A comment or a trailing `!important` in a custom property value no longer drops the token. `--space-1: 4px !important` and `--space-1: 4px /* 0.25rem */` were stored as `4px !important` and `4px /* 0.25rem */`, which do not parse, so the token was lost and the scale could fall back. The value is now read without comments and without the trailing `!important`, and a `;` inside a string or a comment no longer ends it. ([#269](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/269))
- A comment inside a value is kept by the fix, and the warning points at the literal. PostCSS strips comments from `decl.value`, so `padding: 8px /* keep */ 13px` was reported at the start of the value and fixed to `padding: 8px  12px` with the comment gone; the same happened in `clamp()` and in Sass values, where a `// note` between terms was lost too. The rules now read the value as written, comments included, and splice each fix into it, so the result is `padding: 8px /* keep */ 12px` and lengths inside a Sass `//` comment are never read as values. Applies to `use-scale`, `prefer-token`, `no-offscale-transform` and `use-motion-scale`. ([#233](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/233))
- A literal operand of a Sass expression that does not resolve is reported but no longer rewritten. With `$gap` unknown, `margin: $gap * 13px` was fixed to `$gap * 12px`, which changes what the expression computes. A literal next to `*`, `/`, `+`, `-` or `%`, or inside a Sass module function such as `math.div(13px, $n)`, in a value containing `$` is now reported without a fix, by `use-scale` and `prefer-token`. A literal that is a term of its own (`13px $gutter`) is still fixed. ([#234](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/234))
- Typography tokens are no longer offered for spacing properties. `--text-*`, `--fs-*`, `--letter-spacing-*` and `--word-spacing-*` (also prefixed, as `--mantine-letter-spacing-md`) declared no kind, so `padding: 13px` with `fixWith: "token"` was fixed to `var(--text-sm)` and `prefer-token` offered `var(--letter-spacing-wide)` for a margin. They are now typography tokens and serve only `font-size`, `line-height`, `letter-spacing` and `word-spacing`. A Tailwind sub-key such as `--text-sm--line-height` is a typography token too. ([#239](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/239))
- A raw length in the fallback of a token `var()` is checked. A `var()` whose name matched `tokenPattern` was skipped whole, so `padding: var(--space-1, 7px)` passed while `var(--nope, 13px)` was reported. Only the name is skipped now; the fallback is walked like any value, also when nested (`var(--a, var(--b, 7px))`). This adds reports: `use-scale` and `no-offscale-transform` report an off-scale fallback (`translateX(var(--space-2, 13px))`), and `prefer-token` asks for a token in a fallback (`var(--brand-gap, 8px)` becomes `var(--brand-gap, var(--space-2))`). A fallback the enclosing token already holds (`var(--space-2, 8px)` with `--space-2: 8px`) passes `prefer-token`, and no fix ever writes the token a fallback falls back from. ([#240](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/240))
- `--staged` audits the staged content. It took the file list from the index but read each file from disk, so a commit carrying `padding: 13px` passed `--max-findings 0` when the working copy had moved on to `color: blue`, and drift that existed only in the working copy failed a clean commit. The staged blobs are now read from the index in one `git cat-file --batch` call and linted as they will be committed, for stylesheets and template files alike, including a staged file that is no longer in the working tree. `--since` still reads the working tree. ([#248](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/248))
- Git-scoped runs no longer corrupt baselines. With `--staged` or `--since`, `--since-baseline` counted every baseline finding outside the changed files as resolved (`2 resolved, 0 new` for findings in a file that was never scanned), and `--write-baseline` replaced the baseline with the changed files' findings alone, so the next full run failed `--fail-on-new-drift` with `0 resolved, 2 new`. A scoped comparison now counts resolved findings only in the files it scanned, and a scoped write replaces the entries for those files and keeps the rest. A scoped write into a `formatVersion: 1` baseline stops with an error asking for one full `--write-baseline` first, since those entries cannot be merged reliably. ([#249](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/249))
- Stylesheets the audit did not lint no longer count as clean scanned files. `.scss` files skipped because postcss-scss is not installed and files excluded by the project's `.stylelintignore` were in `CSS files scanned` and in the cleanliness denominator, so a project whose only drift sat in skipped files reported 100%. They are now left out of both, and a baseline finding in such a file is neither resolved nor new; the quickstart prints them as `Skipped  2 not audited (2 SCSS without postcss-scss)`. This changes `scanned.cssFiles`, `scanned.totalFiles` and `scaleCleanliness` for projects with skipped or ignored stylesheets. ([#250](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/250))
- `--min-cleanliness 100` fails when any file has a finding. Cleanliness was rounded to the nearest percent, so 1 file with drift among 201 reported 100%, passed the gate and showed a 0% drift badge. The gate now compares the exact value and the reported value is rounded down: that run reads 99%, exits 1, and the badge shows 1%. Reported cleanliness can be one point lower than before. ([#251](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/251))
- Baseline keys no longer depend on the working directory. They named each file relative to the directory the command ran from, so a baseline written by `audit web/src` from the repository root reported `2 resolved, 2 new` and failed `--fail-on-new-drift` when read by `audit ./src` from `web`, with no code change. Baselines now carry `formatVersion: 3` and name files relative to the git top level, or to the scanned directory outside a repository. Baselines written by 3.11.0 still compare: from the directory they were written in as before, and from another one when their recorded `directory` ends the scanned path. They are upgraded on the next `--write-baseline`. ([#252](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/252))
- A stylesheet with a syntax error is reported as a parse error instead of an off-scale finding. Stylelint runs no rule on a file it cannot parse, and its `CssSyntaxError` warning was read as `{"type":"off-scale","value":null}`, counted in total findings, cleanliness and the badge, with nothing saying the file was not audited. It is now a `parse-error` entry in `findings.parseErrors` with a `summary.parseErrors` count, left out of findings, off-scale counts and cleanliness, listed in the text, Markdown, HTML and quickstart output and annotated with `::error` in `--format github`. The `--schema` output and `types/audit.d.ts` describe the new fields. A file that fails to parse no longer adds to `totalFindings`, so `--max-findings` can pass where it failed before. ([#253](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/253))

### Messages

- `rhythmguard doctor`: `✗ .rhythmguardrc.json audit config missing` is gone. An invalid `audit` section reads `✗ .rhythmguardrc.json audit config invalid: <the audit's error>`; the decisions section reads `✓ .rhythmguardrc.json decisions valid (2 decisions)`, `✗ .rhythmguardrc.json decisions invalid: <the error>` or `- decisions check skipped (not configured)`. ([#255](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/255))
- `rhythmguard init`: the write prompt names the file it writes (`Write .stylelintrc? (y/n)` for a JSON `.stylelintrc`; unchanged for `.stylelintrc.json`). When Stylelint loads a config init cannot rewrite, init prints `⚠ Stylelint loads <file> before .stylelintrc.json, so it would never read a .stylelintrc.json.` (or `⚠ Stylelint loads <file>; a new .stylelintrc.json would replace it and leave it unused.`), the lines to add, and `Nothing was written.` ([#257](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/257))
- `use-scale` with `scale: "auto"`: when a token source fails, the fallback note goes on to say why, `No spacing tokens were found for scale "auto"; using preset "rhythmic-4". Token source not found: does-not-exist.css.`, with `Unable to parse token source tokens.json: ...`, `.rhythmguardrc.json: Invalid token source format "scss". ...` or `.rhythmguardrc.json could not be read: ...` for the other causes. The rejected-scale note (`The spacing tokens found do not form a spacing scale ...`) gets the same addition. The note is unchanged when every source reads. ([#270](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/270), [#265](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/265))
- `tailwind-class-use-scale`: an `em` value, or a value at a `baseFontSize` other than 16 whose nearest steps are not quarter steps of `baseFontSize / 4`, now gets the px form of the message, `Use scale values (nearest: 16px or 24px).`, where it named classes such as `Use "p-4" (16px) or "p-6" (24px).` With `allowNegative: false`, `-m-[13px]` reads `Negative values are disabled for this rule.` ([#241](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/241), [#247](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/247))
- Quickstart: `the rhythmic-4 preset is being used.` now reads `the audit's default scale is being used.`, both for no tokens and for rejected tokens. ([#246](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/246))
- New token source warning for a DTCG dimension in a unit other than px or rem: `Token source tokens.json: skipped --spacing-print (dimension unit "pt" is not px or rem).` ([#163](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/163))
- Audit text output: when nothing was found but some stylesheets failed to parse, the closing line reads `! No findings in the stylesheets that parsed; 1 could not be parsed and were not audited.` instead of `✓ No issues found. Your design-system rhythm is clean.` New lines: `Parse errors  1  (not audited)` in the summary and a `PARSE ERRORS` section; in Markdown a `Stylesheets that failed to parse (not audited)` row, a `## Parse Errors` table and the next action `Fix the parse errors above: those stylesheets were not audited.`; in the quickstart `Skipped` and `Parse errors` lines. ([#250](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/250), [#253](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/253))
- A scoped `--write-baseline` into a `formatVersion: 1` baseline fails with `Cannot update <file> from a --staged or --since run: it was written with formatVersion 1, keyed by line. Run --write-baseline once without --staged or --since to upgrade it.` ([#249](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/249))

## [3.11.0] - 2026-10-18

### Fixed

- ESLint `--fix` on `tailwind-class-use-scale` and `tailwind-class-use-motion-scale` no longer rewrites the rest of the string. The fix was built from the decoded value with only the quote re-escaped, so `'p-[13px]\n'` became a string with a real newline that no longer parsed, `\\201C` became an octal escape, `\\` lost its escape and a JSX `&quot;` became `\"`. A fix now replaces only the class token in the source text, and everything else in the literal stays as written. A class with an escape inside it (`p-[13\x70x]`) is still reported but not fixed. Template literals are checked on their decoded text, so a class next to an escape such as `` `p-[13px]\n` `` is now reported; they are still not fixed. ([#225](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/225))
- `rhythmguard fix` parsed SCSS with the plain CSS parser (`postcss.parse` ignores a `syntax` option), so it rewrote values inside `//` comments (`// old: .card { padding: 10px; }` became `padding: 8px`) and skipped valid SCSS such as a rule with `// note` inside it as `could not parse`. SCSS is now read and written with postcss-scss's own `parse` and `stringify`: comments stay byte-identical and the declarations are fixed. Without postcss-scss an `.scss` file is skipped with `postcss-scss is not installed; install it to rewrite SCSS`. ([#229](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/229))
- `rhythmguard fix` ignored `.rhythmguardignore` and `audit.ignore`, so `--write` rewrote files the audit never scans: with `legacy` and `vendor/**` ignored, the audit scanned 1 file and `fix` reported `3 replacements in 3 files`. It now loads ignores through the same code as the audit (the ignore file, `audit.ignore`, `audit.ignorePath`) and takes the audit's `--ignore` and `--ignore-path`; generated and vendored directories such as `node_modules` and `dist` stay skipped. Dry run and `--write` list the same files. A file `--decided` cannot read is named once instead of once per decision. ([#230](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/230))
- `maxFindings` and `minCleanliness` in `.rhythmguardrc.json` now fail the audit. The config was merged into the report but the exit gates read only the command line, so `{"audit":{"maxFindings":0}}` printed findings and exited 0. The gates now read the merged options; a `--max-findings` or `--min-cleanliness` flag still overrides the config, and `--no-config` still ignores it. ([#226](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/226))
- An invalid `--scale` such as `0;4;8`, `4,abc`, `NaN` or `-4,4,8` is refused with `Invalid --scale value "0;4;8": "0;4;8" is not a non-negative number or length.` and exit 1. Before, Stylelint rejected the option, ran no rule, and the audit reported `No issues found` with every gate passing. `audit.scale` in the config is checked the same way. The audit also stops with Stylelint's own text whenever it rejects any rule option, so no other bad option can switch the audit off. ([#227](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/227))
- `--staged` and `--since` scan the changed files from any directory. Git printed paths relative to the repository root, which were resolved against the current directory, so a run from a package directory found no files and exited 0; and names with non-ASCII characters came back quoted and were dropped. Git now runs in the scanned directory with `-z`, and paths resolve against the repository top level, so `src/ä b.css` and `src/sp ace.css` are scanned. ([#228](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/228))
- Negative tokens no longer flip the sign of a fix. Tokens were indexed by their absolute value, so `--space-neg-2: -8px` was offered for `padding: 9px` (writing `var(--space-neg-2)`, which is -8px) and negated for `margin: -9px` (writing `calc(-1 * var(--space-neg-2))`, which is +8px). Token values are now indexed with their sign: a negative token serves only a negative value and is written as is, a positive token is negated for a negative value as before, and a positive value never gets a negative token. Applies to `use-scale` and `no-offscale-transform` with `fixWith: "token"` and to `prefer-token`, including `tokenMapFromCssCustomProperties`, where the last of `--space-2: 8px` and `--space-neg-2: -8px` used to win for both signs. ([#221](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/221))
- A token with more than one value is no longer written by a fix. `--space-3: 12px` at the root and 20px under `@media (min-width: 768px)`, or `--space-2` redefined under `[data-density=compact]`, was indexed once per value, so `padding: 20px` became `var(--space-3)`, which is 12px on mobile. A token whose definitions resolve to more than one px value (or to a value that is not a plain length) is now left out of the token index and of `tokenMapFromCssCustomProperties`, and the fix writes the literal. The same value in two units (`12px` and `0.75rem`) is still one value. ([#231](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/231))
- `unitStrategy: "exact"` with `fixWith: "token"` finds the token in the literal's unit. The snapped value, in rem for a rem literal, was compared with the tokens' px values, so `padding: 1.1rem` against a `1rem` step wrote `var(--space-a)` (`0.0625rem`, 1px) instead of `var(--space-1)` (`1rem`). The lookup now converts the snapped value to px first. Applies to `use-scale` and `no-offscale-transform`. ([#223](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/223))
- An invalid `tokenPattern` (`"["`) is reported again instead of aborting the Stylelint run. `use-scale` and `prefer-token` reported it without a node, which Stylelint rejects with an error about position arguments; the report is now made on the root, once per file, and the file is linted with the default pattern as the option docs describe. ([#222](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/222))
- Autofix converges when `baseFontSize` is not 16. A fix writes rem and em with four decimals, so `0.7rem` at base 18 became `0.6667rem` (12.0006px), and the next run reported that value as off scale because the on-scale check allowed only 0.0001px. A rem or em value is now on the scale when it is within the rounding of four decimals at the base font size (0.00005 of the base, plus the old tolerance); px values are compared as before. Fix then re-lint is clean at base 10, 12, 14, 18 and 20 in `use-scale`, `no-offscale-transform`, `prefer-token`'s numeric scale check and the ESLint Tailwind rule. ([#224](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/224))

### Messages

- `use-scale` and `no-offscale-transform` with `fixWith: "token"`: when a negative token is written as is for a negative literal, the note gives the signed value, `var(--space-neg-2) holds -8px.` A positive token negated for a negative literal still reads `var(--space-3) holds 12px.` ([#221](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/221))
- `prefer-token`: a negative literal that a negative token holds now reads `Use var(--space-neg-2).`, where it read `Use calc(-1 * var(--space-neg-2)).`; a positive literal is no longer offered a negative token. A token that holds more than one value is no longer named, so such a value reads `No known token holds this value; use the nearest token or add one.` ([#221](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/221), [#231](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/231))

## [3.10.2] - 2026-10-15

### Messages

- A value below the smallest step or above the largest named that step twice: `Use scale values (nearest: 14px or 14px).` It is now named once: `(nearest: 14px)`, and for a Tailwind class `Use "p-8" (32px).` Applies to `use-scale`, `no-offscale-transform`, `use-motion-scale` and both ESLint rules. Messages for values between two steps are unchanged.

### Changed

- New README banner without a version number, so it no longer needs replacing each release. GitHub shows the transparent SVG; npmjs.com gets a non-transparent PNG rendered from it on the same background as before.

## [3.10.1] - 2026-10-15

### Fixed

- Token ladders: a ladder whose every step is a `var()` alias of a step on one other ladder, such as Tailwind `@theme` names over a token file, is folded into that ladder instead of being reported again with the same problems. The ladder it aliases lists it under `aliases`, and the Markdown report names it next to that ladder.

## [3.10.0] - 2026-10-15

### Added

- The audit reports token ladders as `contracts.tokens.ladders`: custom properties that share a prefix and a size suffix (`xxs` to `xxl`, `sm`/`md`/`lg`, `1` to `n`) are evaluated at their smallest and largest value (a static length, `clamp()` bounds, the static arguments of `min()` and `max()`, through `var()`) and neighbours are compared at both ends. Collapsed steps (the same size), steps under `minStepPx` apart (default 2px, `audit.ladders.minStepPx`) and inverted steps are reported, and the Markdown report shows each such ladder as a min and max table. A fluid body ladder whose three smallest steps all start at 14px now says so. The section adds no findings and does not change the exit code. ([#205](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/205))
- `scales` on `use-scale` and `prefer-token`: a scale per property group (`spacing`, `radius`, `size`, `typography`), so a type ladder such as 14, 16, 18, 20, 24, 32, 40 can sit next to a 4px spacing scale in one rule block. A group takes values, a preset name or `"auto"`, which reads the group's own tokens (`--font-size-*` and `--text-*`, `--radius-*`). `propertyScales` still wins for its property. Findings checked against a group scale say so: `Use typography scale values (nearest: 16px or 18px).`; every other message is unchanged. The audit takes the same map as `audit.scales` and checks each group it names. ([#204](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/204))
- `checkMathBounds` on `use-scale` and `prefer-token`, and `--check-math-bounds` (or `audit.checkMathBounds`) on the audit: the minimum and maximum of `clamp()` and each length argument of `min()` and `max()` are checked like literals, with the position in the message (`Unexpected off-scale clamp() maximum "1.05rem" (16.8px). ...`). Before, wrapping a value in `clamp()` was a way to leave the scale without a finding. The preferred value of `clamp()` is fluid by design and never checked; neither is an expression, a `var()` or a viewport length. `--fix` and `fixWith: "token"` apply per bound. Off by default in 3.x because it adds findings to existing configs; on by default is a candidate for 4.0. ([#203](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/203))

### Fixed

- `outline-offset` is no longer offered radius tokens. It is checked with the `radius` property group, so 3.9.0's token-kind matching pointed it at `--radius-*`: on one consumer, all 89 `prefer-token` warnings that named a radius token were on `outline-offset` (`outline-offset: -2px` read `Use calc(-1 * var(--radius-sm))`). It is the gap between the border edge and the outline, a spacing length, so it now takes spacing tokens, and under `scales` the spacing scale. Which properties each group checks is unchanged. A contract test asserts that no property but the corner radii resolves to a radius token.

### Messages

- `prefer-token` on `outline-offset`, when a radius token held the value: was `Use var(--radius-*)`, now names the spacing token that holds it, or `No known token holds this value; ...` when none does.

## [3.9.0] - 2026-10-15

### Added

- `scale: "auto"` reads `@mozilla-protocol/tokens` when it is installed: `--spacing-xs` to `--spacing-2xl` (4 to 48px) from `dist/units/units.custom-properties.css`. Mozilla Protocol's benchmark row is measured against that package at 7.0.0, as a Protocol contributor pointed out in mozilla/protocol#1132: 19 off-scale values, against 18 on the `rhythmic-4` fallback, because 12px is not a Protocol step and 48px is.

### Fixed

- `prefer-token` reads the token sources `use-scale` reads for `fixWith: "token"`: the linted stylesheet, `scaleSources`, the `audit.tokenSources` files in `.rhythmguardrc.json` and installed token packages ([#202](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/202)). Before, a token declared in a config token source was invisible to `prefer-token`, which then said no token held a value that one did; on one consumer, 478 of 611 baselined warnings were values an existing token holds. Both rules now resolve tokens through one function, so a token is known to both or to neither, and a contract test holds them to it. The fix writes such a token only when exactly one holds the value in the literal's unit, the same rule `fixWith: "token"` follows.
- Tokens are matched to the property's kind. A `tokenPattern` such as `^--space-|^--radius-` no longer lets `padding: 1rem` be pointed at, or fixed to, `--radius-xl` because it also holds 16px. Radius, typography and motion tokens serve their own properties; spacing and size tokens serve each other's. Applies to `prefer-token` and to `fixWith: "token"` in `use-scale` and `no-offscale-transform`.
- A rule's own `tokenPattern` applies to the token source files it reads as well as to the stylesheet, so `--radius-*` tokens in a config token source are found when the pattern asks for them.
- The audit no longer hangs on template files that contain an unclosed quote followed by escape-dense source. The Tailwind class-string scanner found string literals with a regex whose alternation was ambiguous on every backslash, so from an apostrophe in a comment or a quote inside a regex literal it backtracked exponentially over the `\{ \[ \(` of the next regex literal; on the Ace editor's `mode-alda.js` (10 KB, vendored by a MediaWiki skin) one `rhythmguard audit` ran for eleven hours before it was killed, and Bootswatch's audit took longer than three minutes. The finder is now a single linear pass: an escape never closes a literal, a `'` or `"` literal that reaches a line break is not a literal, a backtick literal may span lines. Both repositories audit in seconds. The benchmark gained five findings that an unclosed quote had been hiding (four in Ghost's `input-group.tsx`, one in Cal.com's `Button.tsx`).
- The audit no longer throws `All input files were ignored because of the ignore pattern` when a project's own `.stylelintignore` excludes every stylesheet the walk found. The files are counted as `scanned.stylelintIgnored` in the JSON contract and shown in text and Markdown output, so a clean report cannot hide that nothing was audited.

### Messages

Message text changes are listed here, so teams that key a warning baseline on message text know which warnings will reappear as resolved-plus-new pairs (see [#172](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/172)).

- `prefer-token`, when a token in a config token source, `scaleSources` or an installed token package holds the value: was `No known token holds this value; use the nearest token or add one.`, now `Use var(--token) (path/to/tokens.css).` When a token in another unit holds it, the message names that token and the fix leaves the literal.
- `prefer-token`, when several tokens hold the value: was `No known token holds this value; ...`, now `Use one of the tokens that hold it: var(--a) or var(--b).`
- Unchanged: the message for a value no token holds, and every `use-scale` message.

### Changed

- The post-publish smoke waits for the version through `npm view --prefer-online`, the client that will install it, instead of the raw packument; for 3.8.0 the packument listed the version a minute before `npm install` could resolve it and the smoke failed.
- The quiet benchmark installs the token packages maintainers named as the home of their scale. A manifest row lists them under `tokenPackages` with a pinned version; `npm run bench:quiet` installs them once under `benchmarks/quiet/packages/` with install scripts disabled and passes the allowlisted token files to the audit as explicit sources, so the row is measured against the ladder the maintainers pointed at instead of the `rhythmic-4` fallback or a set of consumer tokens. Carbon (`@carbon/layout`), Primer CSS and Primer React (`@primer/primitives`), mittwald Flow (`@mittwald/flow-design-tokens`) and AdminLTE (`bootstrap`) are measured this way; the SAP rows stay unmeasured because their theming package carries no ladder. The State of Spacing edition marks these rows `installed` and counts them.
- PatternFly's fourteen benchmark findings are labelled by review: four in a vendored Font Awesome partial and ten in documentation example CSS, none in component SCSS, as the reply in patternfly/patternfly#8579 said. Per-repo labels live in `benchmarks/quiet/labels/`.
- New README banner for 3.8.0. GitHub shows the transparent SVG; npmjs.com, which renders the README on a white page, gets the non-transparent PNG (`assets/rhythmguard-banner.png`): the release job swaps the banner line with `scripts/ci/npm-readme.mjs` just before `npm publish`, and a contract test fails if the banner line is not found exactly once. The npm page changes with the next published version.
- `rhythmguard` and `eslint-plugin-rhythmguard` are on npm (3.8.0, first published by hand on 2026-09-27). `npx rhythmguard` now works in a project that has installed nothing, and the README's first command and ESLint setup use the two packages. Later releases publish them from `release.yml` once each has a trusted publisher and `PUBLISH_COMPANIONS` is set.

## [3.8.0] - 2026-09-18

### Added

- `npm run bench:agents`, the agent eval harness: sixteen tasks over three fixture projects, each run as before (no linter), with findings (up to three correction rounds) and rules only (the control), through Sonnet 5, Haiku 4.5 and Opus 5; outcomes, rounds to zero and cost per condition in a dated edition under `docs/agent-evals/`. `--dry-run` exercises the whole pipeline against a scripted model. Method in `docs/AGENT_EVALS.md`. ([#135](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/135))
- The browser playground runs the real rules. `docs/playground/rhythmguard.js` is an esbuild bundle of the shipped `use-scale`, `prefer-token`, `no-offscale-transform` and `use-motion-scale` with a small Stylelint shim; the page offers `scale: "auto"`, every preset, SCSS, and a fixed-CSS view. A contract test rebuilds the bundle and compares the page's sample against Stylelint, so the playground cannot drift from the plugin again. ([#57](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/57))
- `use-scale` evaluates Sass expressions in `.scss` declarations: `padding: $spacer * .3` is reported as off scale with `Evaluates to 4.8px.` when `$spacer` resolves from the linted file, `scaleSources`, the config's token sources or an installed package; each term of `padding: $y $x` is checked on its own; `* / + -`, negation, parentheses and `math.div()` are understood. Unresolvable terms are left alone as before, and an expression is never rewritten by `--fix`. The audit inherits it, so SCSS design systems now see drift that hid behind a variable.
- [`PetriLahdelma/rhythmguard-action`](https://github.com/PetriLahdelma/rhythmguard-action), a GitHub Action that runs the audit, annotates the diff, posts the report as one pull-request comment updated in place, and fails on new drift against a committed baseline. Linked from the README and the CI adoption recipe.
- `rhythmguard`, the command as its own package: `npx rhythmguard` resolves a package of that name, and none existed, so the first command in the README failed in a project that had installed nothing (`npx stylelint-plugin-rhythmguard` worked, and the README says that until the package is published). `packages/rhythmguard` is one dependency and one line that runs the CLI, now exported as `stylelint-plugin-rhythmguard/cli` with a `main()`.
- `eslint-plugin-rhythmguard`, the ESLint companion under its own package name, from `packages/eslint-plugin-rhythmguard`. It re-exports `stylelint-plugin-rhythmguard/eslint`, so the rules, options and messages are one implementation; it exists so a search for an ESLint Tailwind plugin finds it. Published by the release run once the package has a trusted publisher.

### Changed

- The post-publish smoke waits up to ten minutes for the registry to list the new version before deciding it is unpublished. It checked once, and the registry took three minutes to list 3.7.1, so the smoke skipped itself and had to be dispatched by hand.

## [3.7.1] - 2026-09-17

### Fixed

- Sass maps declared through a merge helper are read: `$spacers: defaults((...), $spacers)` (Bootstrap v6), `map.merge($base, (...))` and `map-merge((...), (...))` contribute the merged map, later keys winning. The reader also follows Sass assignment rules now: a later plain assignment replaces an earlier `!default`, a later `!default` does not. Before, the first assignment always won, so Bootstrap v6's `$spacers: () !default;` hid the map that followed it and `scale: "auto"` fell back. ([#143](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/143))

### Changed

- The quiet benchmark has a `bootstrap-v6` row, the branch its maintainers asked to see (twbs/bootstrap#42907); the manifest accepts a `ref` so a row can pin a branch other than the default.
- The release verify matrix and the post-publish smoke are back on the self-hosted farm. The repository variable `RELEASE_ON_HOSTED=true` moves a release onto GitHub-hosted runners while the farm is down, without a workflow edit or a re-cut; the release checklist explains when to use it.

## [3.7.0] - 2026-09-17

### Added

- Every rule accepts `note`, a sentence of up to 200 characters appended to each finding after the built-in text: `... (nearest: 12px or 16px). See docs/spacing.md for approved exceptions.` The built-in text is unchanged, so tooling that matches on it keeps working. Stylelint and ESLint rules alike. ([#134](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/134))

### Changed

- `prefer-token` names the token it would write and where it was read from: `Unexpected raw scale value "12px". Use var(--space-3) (src/tokens.css).` The origin is the linted stylesheet, the `tokenMapFile` or the Tailwind config; an inline `tokenMap` entry is named without one, and a negative literal as `calc(-1 * var(--space-3))`. When no mapping holds the value the message says `No known token holds this value; use the nearest token or add one.` It said `Use design tokens for scale decisions.` in every case. ([#133](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/133))
- `use-scale` and `no-offscale-transform` with `fixWith: "token"` append `var(--space-3) holds 12px.` when exactly one token qualifies, so the message names what the fix writes. ([#133](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/133))
- `tailwind-class-use-scale` names the utility classes for the two nearest steps, with their px values, and its fix writes the utility class instead of an on-scale arbitrary value: `p-[13px]` reads `Use "p-3" (12px) or "p-4" (16px)` and becomes `p-3`; `md:-m-[13px]!` becomes `md:-m-3!`; `p-[0.8125rem]` becomes `p-3`. The class number is the snapped value divided by the new `spacingUnit` option (4px, Tailwind's `--spacing`); when it is not a quarter step the fix keeps the arbitrary form, and `spacingUnit: false` keeps it always. The audit's Tailwind findings carry the same text and `fixedToken`. ([#132](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/132))
- The release workflow verifies and publishes on GitHub-hosted runners, and the post-publish smoke runs there too. The first 3.7.0 release waited 24 hours for a self-hosted runner that never registered and was cancelled; a release no longer depends on the farm. Pushes and pull requests still use it.

## [3.6.0] - 2026-09-09

### Added

- **Token chains.** The audit follows every spacing-named custom property through `var()` references to its terminal values and reports, in `contracts.tokens.chains` and a Markdown section, whether each resolves on the scale, off it, to an undeclared token or a cycle, to several lengths at once (themes), to a computed expression, or to a non-length. Fallbacks are honoured; declarations from token sources and installed packages count. This is the measurement token-layered systems need, where a literal scan finds almost nothing. ([#110](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/110))
- `rhythmguard fix <dir> --value <length> --to <replacement>` replaces one spacing literal everywhere it appears, matching by px, keeping the sign, never touching token definitions, token functions or non-spacing properties; dry run until `--write`, idempotent, SCSS through `postcss-scss`. `--decided` executes every `snap` decision whose `to` names the replacement. `postcss` is now a declared runtime dependency (the rules always received its AST; the codemod parses files itself).
- `use-scale` and `no-offscale-transform` accept `fixWith: "token"`: autofix writes `var(--name)` when exactly one custom property holds the snapped value in the literal's own unit, read from the stylesheet, `scaleSources`, the config file's token sources and installed token packages, and the literal otherwise. A rem literal never becomes a px token, and two tokens with the same value never become a guess. Default stays `"value"`; the default flips in 4.0.
- **Decisions.** A `decisions` section in `.rhythmguardrc.json` records what a team decided about each off-scale value: `adopt` (part of the scale, optionally naming the token it should become), `allow` (intentional, optionally on some properties only), `snap` (a slip to fix) or `undecided`. Adopted and allowed values stop being findings in the Stylelint rules and the audit alike; values match by px so `10px` and `0.625rem` are one decision. `rhythmguard audit --plan` proposes the section from the current findings and keeps decisions already made. The audit reports counts in `contracts.decisions`. Rules accept `decisions: false` to ignore the section. Docs: `docs/AUDIT.md#decisions`.

### Changed

- Baselines key findings by content (rule, file, property, value, occurrence) instead of line and column, so moving or reformatting code no longer produces matching "new" and "resolved" pairs while a second identical off-scale declaration is still new. Baseline files are `formatVersion: 2`; version 1 files still compare and upgrade on the next `--write-baseline`. Text, Markdown and GitHub output lead with `Since baseline: N resolved, M new`.

### Fixed

- Token values of the form `calc(var(--x) * 2)` are no longer read as a 2px token; the calc forms require a unit on the factor, as in Radix's `calc(4px * var(--scaling))`.
- `prefer-token` autofix writes a negative token as `calc(-1 * var(--token))`. It wrote `-var(--token)`, which is not valid CSS.

## [3.5.0] - 2026-09-08

### Fixed

- `audit.tokenSources` entries in `.rhythmguardrc.json` and typed sources passed to the API keep their `tokenPattern`. Both normalisers dropped it, so a per-source pattern was silently ignored by the audit while the same key worked for the package allowlist.

### Added

- Token-package discovery reads five more packages, each named by its maintainers in the audit issues: `bootstrap` (`$spacer`, `$spacers`; Bootstrap-derived systems such as AdminLTE inherit it), `@patternfly/patternfly`, `@mittwald/flow-design-tokens` (`--size-px--*` and `--size-rem--*`, one ladder in two units), `govuk-frontend` and `nhsuk-frontend`. A contract test checks every allowlist entry.
- The State of Spacing edition marks rows whose scale lives in a dependency package the benchmark's sparse checkout cannot see, and rows whose maintainers said there is no spacing scale by design; neither is counted.

## [3.4.0] - 2026-09-06

### Fixed

- The Sass token evaluator bounds map nesting (16 levels) and expression nesting (64 levels). Generated or adversarial input past those limits is skipped like any other expression it cannot evaluate, instead of overflowing the stack and aborting the audit.
- `scale: "auto"` prefers root-level declarations. When the custom properties in `:root`, `html`, `:host` or `@theme` (through conditional at-rules) form a scale on their own, variables declared inside component selectors no longer join it. Mantine now infers exactly its `--mantine-spacing-*` ladder instead of a mix with `--chip-spacing`. When the root carries no scale, every declaration still counts. ([#54](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/54))
- `postcss-value-parser` is declared as a runtime dependency. The rules require it at runtime but it was only a dev dependency, resolved through Stylelint's hoisted copy; strict package managers could not install the plugin without it.

### Changed

- Internal architecture, no behaviour change (the 57-repository benchmark check shows zero moved findings): `src/utils` is now `src/core` with domain-named modules; Stylelint-coupled code lives in `src/rules/report.js` and `src/rules/validate.js`; the four rules are assembled from shared primitives (`fixedLengthValue`, `createPropertyScaleResolver`, `withResolvedScale`, `reportValueNode`); the audit uses the same CSS token scanner as token sources; project discovery for `scale: "auto"` is cached per working directory and revalidated by file mtime; audit CLI flags are one option table from which `--help` is rendered. Executable rules for layer direction, cycles, dependency declaration and CJS/ESM parity live under `test/contracts/`. The map is [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
- `src/audit/scan.js` (676 lines) is three modules by responsibility: `scan/files.js`, `scan/stylesheets.js`, `scan/templates.js`.
- Tests are grouped by what they prove: `test/{unit,rules,cli,api,contracts,compat,bench}`.
- CI and benchmark workflows cancel superseded runs on the same ref, skip docs-only changes, and can be dispatched by hand.

## [3.3.0] - 2026-09-06

### Fixed

- Whole numbers ending in zero were printed without their zeros: a scale containing `30px` and `60px` produced messages such as `nearest: 3px or 6px`, autofix wrote `3px` for a value snapped to `30px`, and scale inference added phantom small steps (`3px`, `6px`) to every scale that contained `30px` or `60px`. This affected all three Stylelint rules, the ESLint rule's suggested classes, the audit and `scale: "auto"`. Found while reading why GOV.UK's scale came out as `1, 2, 3, 4, 5, 6, 10, 15, ...`. If you use a scale with round-ten values, rerun `--fix` on files that were fixed with an earlier version.
- `scale: "auto"` accepts tokens named `spacer`, so PatternFly's `--pf-t--global--spacer--*` ladder is read instead of falling back. ([#85](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/85))
- Token-package discovery reads `@carbon/layout`, where Carbon defines `$spacing-01` to `$spacing-13`. `.scss` files are accepted as token sources, in `scaleSources` and `--token-source` too. ([#87](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/87))
- `scale: "auto"` and `--scale auto` reject an inferred scale that does not look like one: fewer than three steps, fractional values, no common step (2, 3, 4, 5 or 8), or, in the audit, tokens that come mostly from component files without a near-perfect ladder. The rule then uses the preset and says why in its first message; the audit reports `contracts.scale.rejected` with the source, values and reasons, and the Markdown and text output show it next to the scale source. Component-local variables such as `--chip-spacing: 3px` can no longer become the project scale. ([#88](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/88))
- Sass spacing maps with one namespace segment before the anchor, such as GOV.UK's `$govuk-spacing-points` and NHS.UK's `$nhsuk-spacing-points`, are read when they hold at least four distinct lengths. Namespaced scalars such as `$dropdown-spacer` and small maps stay excluded, and unitless Sass numbers (mixin parameter defaults such as `$spacing-responsive: 6`, multipliers such as `$spacing-unit: 8`) are no longer taken as lengths. ([#86](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/86))
- When several Tailwind v4 `--spacing` bases are found, only the first is expanded. A union of ladders from several theme files produced fractional steps that matched nothing on shadcn/ui. ([#89](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/89))

### Changed

- The quiet benchmark manifest grew from 20 to 57 repositories: design systems (GOV.UK, NHS.UK, PatternFly, Cloudscape, Angular Material, Ionic, Element Plus, HashiCorp, SAP Fundamental Styles and UI5 Web Components, daisyUI, Skeleton, Semi, n8n, Utrecht, Mozilla Protocol, Foundation, CoreUI, Tabler, AdminLTE, Materialize, Pure, Tachyons) and CSS-heavy applications (Mastodon already; now Forem, Discourse, Zulip, Mattermost, Grafana, Metabase, Directus, Excalidraw, Ghost, Cal.com, VS Code base UI, Docusaurus, VitePress and Starlight themes). Every repository has a pinned snapshot and the State of Spacing edition is regenerated over the full set.
- `npm run bench:outreach` drafts one audit issue per benchmark repository under `docs/outreach/audits/`; a separate paced posting script runs a per-repository preflight and records every outcome in `docs/outreach/embed-log.md`.

## [3.2.0] - 2026-09-06

### Added

- `rhythmguard audit --format badge` writes a shields.io endpoint document for a README badge: `spacing drift` as a percentage by default, or the off-scale count with `--badge-metric findings`. Workflow in `docs/CI_ADOPTION.md`. ([#68](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/68))
- `rhythmguard init --agents <claude|cursor|copilot|all>` installs the agents block from `docs/FOR_AGENTS.md` as a Claude Code skill, a Cursor rule, or a block in `.github/copilot-instructions.md`. The packs ship in the package under `agents/`, are generated by `npm run build:agents`, and a test keeps them in sync with the docs. ([#69](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/69))
- `npm run bench:state-of-spacing` generates a dated State of Spacing edition from the quiet benchmark results: one row per repository with scale source, off-scale count, drift per 100 CSS files, cleanliness, top values, top properties, and the change since the previous edition. Benchmark results now record the property of each finding. First edition at 20 repositories in `docs/STATE_OF_SPACING.md`. ([#70](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/70))

### Changed

- Dev dependencies: eslint 9.39.5; the unused `geist` package and its `next` and `sharp` chain are gone, and `npm audit` reports no findings. No runtime dependency changed.

## [3.1.0] - 2026-09-06

### Added

- Audit findings for CSS declarations carry the declaration's `property`, recovered from the source at the warning position (`null` inside at-rules). Off-scale findings are counted by property in `offScaleProperties`, exposed as `contracts.scale.offScaleProperties`, rendered as a histogram in text, Markdown and HTML output and as a `Top properties` line in the quickstart. Baseline keys and benchmark snapshots are unchanged. ([#64](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/issues/64))

### Changed

- `rhythmguard audit --help` describes what `--scale auto` reads and in which order, SCSS scanning through `postcss-scss`, and the value, property and file breakdowns.
- CI and release workflows no longer run the full suite on the Stylelint 16.0.0 floor as an allowed-to-fail step; that step produced an error annotation on every green run. The blocking floor suite is unchanged. Actions `checkout` and `setup-node` moved to v5.

## [3.0.0] - 2026-09-06

Upgrade notes: [`docs/MIGRATING_TO_3.md`](./docs/MIGRATING_TO_3.md).

### Breaking

- Node 20.19 or newer is required. Node 18 support is removed.
- `stylelint-config-tailwindcss` and `stylelint-plugin-logical-css` are optional peer dependencies instead of dependencies. Install `stylelint-config-tailwindcss` yourself if you extend `configs/tailwind`. The package now has one runtime dependency, `known-css-properties`.
- Removed configs `expanded`, `logical`, `migration` and `react-tailwind`. Their rule blocks are reproduced in the migration guide. `plugin.configs` has five keys: `embed`, `motion`, `recommended`, `strict`, `tailwind`.
- `rhythmguard init` writes the `tailwind` config plus Next.js build ignores for Next.js projects instead of `react-tailwind`.

### Removed

- Campaign media, slide images, outreach drafts and old planning documents are no longer in the repository. The README banner and the cover image referenced by a published article remain.

### Added

- The audit now scans `.scss` files through `postcss-scss` (new optional peer dependency). Without it, SCSS files are reported as skipped instead of ignored. `scanned.scssFiles` and `scanned.scssSkipped` join the JSON contract; text and Markdown output show the counts.
- Quiet benchmark widened from 7 to 20 public repositories, adding SCSS-first systems: Bootstrap, Primer CSS, Penpot, Mastodon, Gutenberg components, GitLab UI, Pico, Bulma, Spectrum CSS, USWDS, Carbon, Salesforce Lightning, wp-calypso components.

- `scale: "auto"` now reads spacing tokens shipped by installed design-token packages when the project's own stylesheets define none: `tailwindcss` (v4 `theme.css`), `@radix-ui/themes`, `@mantine/core`, `@primer/primitives`, `@shopify/polaris-tokens`, `@spectrum-css/tokens`. Provenance is `token-package`. Token-source entries accept a per-file `tokenPattern` for packages that name spacing differently. The allowlist is `src/utils/token-packages.json`.
- Sass variables and maps are token sources for `--scale auto`, for `scaleSources` files, and for `scale: "auto"` inside the rules when the linted `.scss` file declares them (with `postcss-scss`): `$spacer: 1rem`, `$spacing-01: 0.125rem`, and maps such as `$spacers: (1: $spacer * .25, ...)` with nested maps, variable references, `* / + -` arithmetic and `math.div()`. Unevaluable function calls, strings, keywords and interpolated keys are skipped. Bootstrap, Bulma, Carbon and USWDS now infer their own scales in the quiet benchmark.

### Changed

- New README banner.
- Contributing: rewritten `CONTRIBUTING.md` with ways to contribute and the local gate, a Contributor Covenant code of conduct, a false-positive issue template, a current security policy, and a GitHub-hosted CI job so pull requests from forks get lint, typecheck and test feedback.

## [2.2.0] - 2026-09-05

### Added

- Added `scale: "auto"` to `rhythmguard/use-scale`, `rhythmguard/no-offscale-transform` and `rhythmguard/prefer-token`. The scale is inferred from spacing tokens: `scaleSources` files, then `.rhythmguardrc.json` audit token sources, then the linted stylesheet's custom properties, then `tailwindConfigPath`, with a `rhythmic-4` fallback that is announced in the first report of the file. First matching source wins.
- Added the `scaleSources` rule option and made `tailwindConfigPath` available to every scale rule.
- Added `rhythmguard audit --scale auto`, which infers one project-level scale from token sources, then spacing custom properties across the scanned CSS, then the default. The JSON contract now carries `contracts.scale.values`, `source` and `files`; text and Markdown output print the scale and its source.
- Added the quiet benchmark (`npm run bench:quiet`): audits public design systems with `--scale auto`, classifies findings as drift, noise or allowance, and writes `docs/QUIET_BENCHMARK.md` with a per-repo false-positive rate. Manifest and classification rules live in `benchmarks/quiet/`.
- Scale inference now reads token values written as `calc(<length> * var(--factor))` (Radix Themes), expands a bare Tailwind v4 `--spacing` base into the default multiplier scale, and matches prefixed spacing tokens such as `--lb-spacing-md` while excluding `letter-spacing` and `word-spacing`.

- Added `docs/FOR_AGENTS.md` with a paste-ready `AGENTS.md` block and the commands a coding agent should run, and a "what it is not" paragraph at the top of the README (no color checking, class strings need the ESLint companion, no SCSS in the audit).
- The quiet benchmark now pins each repository to a recorded commit and keeps snapshots of its findings under `benchmarks/quiet/snapshots/`. `npm run bench:quiet -- --check` fails when the finding set or the inferred scale changes, `--update-snapshots` accepts a reviewed change, `--latest` audits upstream heads. A farm workflow runs the check on every change and the upstream run weekly.
- `npx rhythmguard` with no command now runs a zero-config quickstart: detects Tailwind (and its major version), Next.js, an existing Stylelint config and token files; infers the spacing scale from the project's own tokens; audits the current directory; and prints the exact `.stylelintrc.json` (plus an ESLint snippet for Tailwind) to paste. `--help` is unchanged; `rhythmguard quickstart` is an explicit alias.
- Added `stylelint-plugin-rhythmguard/configs/embed`: `use-scale` at warning level with `scale: "auto"`, no `extends`, shape frozen for 2.x. The entry point for shared-config authors who want to enable spacing governance for their consumers without knowing each consumer's scale. Guide in `docs/FOR_CONFIG_AUTHORS.md`.
- Added `allowHairlines` (default `true`) to `use-scale`, `no-offscale-transform` and `prefer-token`. Non-zero lengths that resolve to one CSS pixel or less (`1px`, `-1px`, `0.5px`, `0.0625rem`) are exempt: they compensate for borders and rendering, not spacing. The quiet benchmark showed them to be the only systematic false positive left across Radix Themes, Mantine, Primer React and Liveblocks. Set `allowHairlines: false` to restore the previous reports.

### Fixed

- `rhythmguard/prefer-token` no longer reports percentages such as `translate(-50%, -50%)` or `inset: 100%` as raw scale values. Percentages are never token candidates. This was the largest noise source in the quiet benchmark.
- `rhythmguard/use-scale` with `allowPercentages: false` now reports percentage lengths instead of silently skipping them.

## [2.1.0] - 2026-09-05

### Added

- Added `rhythmguard audit --format github`, emitting GitHub Actions workflow-command annotations (one `::warning` per finding, a `::notice` summary) for inline PR feedback without a formatter dependency.
- Added per-rule documentation pages under `docs/rules/` for every Stylelint and ESLint rule. Rule `meta.url` and ESLint `meta.docs.url` now point at them, and a test enforces the link.
- Added `npm run typecheck`: compiles the published TypeScript declarations, a consumer check file, and the packaged examples.
- Added Stylelint 17 to the CI and release matrices (Node 20 and 22; Node 18 is excluded for Stylelint 17).
- Added a bug-report issue template.

### Changed

- README cut from 833 lines to a quick start. Config details, scale presets, the audit reference and the full custom setup moved to `docs/CONFIGS.md`, `docs/SCALE_PRESETS.md` and `docs/AUDIT.md`; development and release notes moved to `CONTRIBUTING.md`.
- Split the audit CLI into focused modules under `src/audit/`; `src/cli/audit.js` is now a thin command shell. No behaviour change.
- Release, post-publish smoke and community-scale workflows now run on the self-hosted runners like CI.

### Fixed

- `plugin.configs` and the ESM entry now expose `react-tailwind`, matching the `./configs/react-tailwind` package export. A test asserts parity between package exports and the programmatic configs object.
- `AuditOptions` declaration: `config` and `output` were never read by the audit API and are replaced by the real keys `configPath` and `outputPath`; `noConfig` and `tokenSourceFormat` added.

## [2.0.1] - 2026-06-17

### Added

- Added TypeScript declaration files for the public plugin, config, rule, preset, ESLint companion, and Audit 2.0 API exports.
- Added dependency-free Audit 2.0 dashboard and Figma-friendly export examples under `examples/`.
- Added CI adoption and motion-default evidence docs for safer baseline-based rollout.

### Fixed

- Fixed `rhythmguard init` scripted input handling so multiple prompts work reliably in piped/CI contexts.

## [2.0.0] - 2026-05-23

### Changed

- `rhythmguard audit --format json` now emits the stable audit contract with `schemaVersion: "2.0"`.
- Moved the pre-2.0 audit JSON shape to `--format json-v1` for migration compatibility.
- Updated audit defaults to use the explicit spacing token pattern `^--(space|spacing)-`.

### Added

- Added `stylelint-plugin-rhythmguard/audit` with `createAuditReport`, `loadAuditConfig`, `parseTokenSources`, and `toAuditContractReport`.
- Added `rhythmguard audit --format html`, `--output <file>`, and `--schema`.
- Added `rhythmguard doctor` checks for `.rhythmguardrc.json`, configured token sources, motion audit config, and baseline files.
- Added `docs/MIGRATING_TO_2.md`.

## [1.9.0] - 2026-05-23

### Added

- Added opt-in `rhythmguard/use-motion-scale` for duration/delay scale enforcement and raw easing reporting.
- Added `stylelint-plugin-rhythmguard/configs/motion`.
- Added ESLint companion rule `rhythmguard-tailwind/tailwind-class-use-motion-scale` for Tailwind `duration-[...]`, `delay-[...]`, and `ease-[...]` arbitrary values.
- Added `rhythmguard audit --include-motion` and `.rhythmguardrc.json` `includeMotion` support.

## [1.8.0] - 2026-05-23

### Added

- Added `.rhythmguardrc.json` audit config loading with `--config` and `--no-config`.
- Added external audit token sources with `--token-source`, `--token-source-format`, and `--token-kind`.
- Added token source parsing for CSS custom properties, Tailwind v4 `@theme`, flat JSON, Style Dictionary JSON, and DTCG JSON.
- Expanded audit token-contract reporting with loaded source metadata, raw values that match known tokens, and conflicting token values.

## [1.7.0] - 2026-05-23

### Added

- Added audit baseline workflows with `--write-baseline`, `--since-baseline`, and `--fail-on-new-drift` for legacy-safe CI adoption.
- Added changed-only audit scopes with `--staged` and `--since <git-ref>`.
- Added CI threshold gates with `--max-findings` and `--min-cleanliness`.
- Added `.rhythmguardignore` / `--ignore-path` support for reusable root-relative scan pruning.
- Added token contract reporting for spacing tokens used but missing, tokens defined but unused, and repeated raw value candidates.

## [1.6.1] - 2026-05-23

### Fixed

- Added `rhythmguard audit --ignore` for pruning root-relative paths before scanning large repositories.
- Scoped audit traversal to scan-relevant CSS and template files instead of collecting every file under the audit root first.
- Added default audit skips for common generated directories such as `.svelte-kit`, `.turbo`, and `.vercel`.

## [1.6.0] - 2026-05-19

### Added

- `rhythmguard audit` now reports design-system drift across CSS declarations and Tailwind arbitrary spacing class strings.
- Added `--format markdown` / `--markdown` audit output for PR-ready design-system health reports.
- Audit JSON now includes format version, CSS findings, Tailwind class-string findings, scan counts, top affected files, and summary totals while preserving existing top-level count fields.

## [1.4.2] - 2026-02-21

### Changed

- npm package artifact is now leaner by excluding non-runtime media assets from published files.
- README media links now use absolute GitHub URLs so npm README rendering remains intact without bundling local media files.
- Added a dedicated "Drop-In for Existing Projects" path with a single install command and a single config block.
- Added comparison and migration guidance:
  - `docs/COMPARISON.md` (`defensive-css` vs `logical-css` vs Rhythmguard + migration recipes)
  - `docs/ADOPTION_DIFFS.md` (real before/after excerpts from public codebases)
- Added Dev.to publishing assets:
  - `docs/DEVTO_ORIGINAL_UPDATE_NOTE_2026-02-21.md`
  - `docs/DEVTO_CONTINUATION_2026-02-21.md`

## [1.4.1] - 2026-02-21

### Fixed

- `properties` now correctly supports regex-like string entries (for example `"/^(margin|padding)$/"`) in rule options.
- Property matcher behavior is now deterministic for regex matchers with stateful `g`/`y` flags by normalizing stateful behavior during matching.
- Generic rule messaging for expanded property groups:
  - `rhythmguard/use-scale` now reports off-scale values without spacing-only wording.
  - `rhythmguard/prefer-token` now reports raw scale values without spacing-only wording.

## [1.4.0] - 2026-02-21

### Added

- New shared configs:
  - `stylelint-plugin-rhythmguard/configs/expanded`
  - `stylelint-plugin-rhythmguard/configs/logical`
  - `stylelint-plugin-rhythmguard/configs/migration`
- New ESLint companion export: `stylelint-plugin-rhythmguard/eslint` with rule:
  - `rhythmguard-tailwind/tailwind-class-use-scale`
- Token migration source automation for `rhythmguard/prefer-token`:
  - `tokenMapFromCssCustomProperties`
  - `tokenMapFile`
  - `tokenMapFromTailwindSpacing` + `tailwindConfigPath`
- ESM wrapper entry points for package root, configs, presets, rules, and ESLint companion.

### Changed

- Broadened scale enforcement model with built-in property groups:
  - `spacing`, `radius`, `typography`, `size`
- New per-property override options:
  - `propertyGroups`
  - `propertyScales`
- New math-function targeting options:
  - `mathFunctionArguments`
  - `ignoreMathFunctionArguments`
- New `unitStrategy` option (`convert` or `exact`) for non-convertible unit workflows.
- Compatibility updated to support Stylelint `^16 || ^17`.
- Tailwind token-map extraction now supports `.js`, `.cjs`, and `.mjs` config files and merges `theme.spacing` with `theme.extend.spacing`.

## [1.3.0] - 2026-02-17

### Added

- Strict `secondaryOptions` validation for all three rules:
  - `rhythmguard/use-scale`
  - `rhythmguard/prefer-token`
  - `rhythmguard/no-offscale-transform`
- Invalid option names (for example `sevverity`) now fail with Stylelint invalid option warnings instead of silently being ignored.
- Type/shape validation for option payloads (for example `properties` must be an array, `tokenMap` must be an object).
- Regression tests for invalid secondary option names and option value shapes.

### Changed

- Added `known-css-properties` as a direct runtime dependency to guarantee `properties` option validation in consumer installs.
- `properties` option validation now checks supported spacing property names against known CSS property metadata (plus `translate-x`, `translate-y`, `translate-z`).

## [1.2.1] - 2026-02-17

### Fixed

- Ignore invalid unitless non-zero literals (`margin: 13`) across all rules instead of treating them like `px` and autofixing them.
- Reduced strict-mode transform overlap by scoping `rhythmguard/use-scale` away from transform properties in the shared strict config.
- `rhythmguard/prefer-token` now supports `enforceInsideMathFunctions` for optional math-function enforcement.
- Hardened `var()` token argument detection to parse the first argument structurally (rather than comma string splitting).
- npm README link integrity: docs links now resolve to absolute GitHub URLs from the npm package page.
- Release workflow now detects missing `NPM_TOKEN` and skips publish cleanly with an explicit notice instead of failing.

### Added

- Dev.to article link in README resources:
  - https://dev.to/petrilahdelma/enforcing-your-spacing-standards-with-rhythmguard-a-custom-stylelint-plugin-1ojj
- Regression tests covering:
  - unitless non-zero handling in all three rules
  - strict transform overlap guard
  - prefer-token math-function enforcement toggle

## [1.2.0] - 2026-02-17

### Added

- Tailwind integration guidance in README:
  - exact enforcement boundary (CSS declarations vs class strings)
  - recommended layered setup with `stylelint-config-tailwindcss`, `eslint-plugin-tailwindcss`, and `prettier-plugin-tailwindcss`
  - architecture direction for thorough Tailwind coverage.
- New shared config entry point: `stylelint-plugin-rhythmguard/configs/tailwind`.
- Tailwind-oriented test coverage for transform token functions and nested translate values.

### Changed

- Hardened transform translate parsing to handle nested function values consistently.
- `use-scale` and `no-offscale-transform` now respect `enforceInsideMathFunctions` in transform translation contexts.

## [1.1.0] - 2026-02-17

### Added

- `CODEOWNERS` for repository ownership and review routing.
- Post-publish npm smoke workflow to validate clean-project install and lint execution from the registry.
- Non-blocking full-suite observability on Stylelint `16.0.0` in CI/release verification.
- Community scale registry with JSON schema, CI validation, and scaffolding script.
- Community contribution workflow assets:
  - `docs/COMMUNITY_SCALES.md`
  - `scales/community/*.json`
  - `scripts/scales/add-scale.mjs`
  - `scripts/scales/validate-community-scales.mjs`
  - scale request issue template.

### Changed

- Preset loader now includes validated community scale files from `scales/community`.
- Exported preset helpers now include:
  - `listCommunityScalePresetNames()`
  - `getCommunityScaleMetadata(name)`

## [1.0.0] - 2026-02-17

### Changed

- Promoted the package to `1.0.0` to signal production-ready stability for rule behavior, config entry points, and autofix determinism.
- Added explicit public bug-report/support contact: `hello@petrilahdelma.com`.
- Added npm metadata bug-report email for direct reporting via package details.

## [0.1.1] - 2026-02-16

### Changed

- Removed the Visual System Note section from README.
- Added `CONTRIBUTING.md` with semver, release, and rule-change guidance.
- Added CI/release matrix validation for Node (`18.18.2`, `20.x`, `22.x`) and Stylelint (`16.0.0`, latest `16`).
- Added tarball pack smoke test to validate packaged exports and real install flow.
- Updated npm package description metadata.

## [0.1.0] - 2026-02-16

### Added

- Core spacing governance rules:
  - `rhythmguard/use-scale`
  - `rhythmguard/prefer-token`
  - `rhythmguard/no-offscale-transform`
- Autofix support for deterministic nearest-scale replacement and explicit token map replacement.
- Built-in config entry points:
  - `stylelint-plugin-rhythmguard/configs/recommended`
  - `stylelint-plugin-rhythmguard/configs/strict`
- Built-in scale presets and aliases across product, editorial, and modular/theory-driven systems.
- Preset helpers exported via `stylelint-plugin-rhythmguard/presets`.
- Unit tests, coverage reports, and benchmark scripts.
- Release workflow with npm provenance publishing.
