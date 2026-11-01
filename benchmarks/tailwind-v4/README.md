# Tailwind v4 apps: pre-registration

Phase 0 of [docs/ESLINT_PLAN.md](../../docs/ESLINT_PLAN.md) asks one question before any ESLint work is built: do Tailwind v4 apps drift off their spacing scale often enough to sell a rule on? This file fixes the sample, the measurement and the pass mark **before anything is measured**. It was committed on 2026-11-01, before any linter ran on these repositories. Changes after that date go in the change log at the end, with a reason, and the result reports both the original and the changed definition.

## The sample

[`apps.json`](apps.json) lists 20 apps (`"role": "sample"`) and 5 reserves (`"role": "reserve"`), each pinned to the default-branch commit of 2026-11-01. A reserve replaces a sample app, in the listed order, only if that app cannot be cloned or parsed at its pinned commit. The replacement and its cause go in the change log.

### How the 20 were chosen

1. **Pool.** GitHub repository search, sorted by stars, for each of the topics `tailwindcss`, `nextjs`, `react`, `vite`, `saas`, `self-hosted`, `open-source`, `shadcn-ui` and `typescript`, with `stars:>=1000 archived:false fork:false pushed:>=2026-08-01`, up to 1,000 results per topic. That gave 2,657 repositories, of which 1,709 have TypeScript or JavaScript as their main language ([`search.mjs`](../../scripts/bench/tailwind-v4/search.mjs)).
2. **Tailwind v4.** The top 500 of those by stars (down to 6,496 stars) were checked for a `package.json` outside examples, templates and tests that depends on `tailwindcss` 4 (pnpm catalogs resolved) or on `@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli` or `@tailwindcss/webpack`. 177 do ([`v4check.mjs`](../../scripts/bench/tailwind-v4/v4check.mjs)).
3. **Mechanical app test**, per v4 package ([`classify.mjs`](../../scripts/bench/tailwind-v4/classify.mjs)). The package's own `tailwindcss` range is v4. Its directory is not docs, a website, a landing page, a blog, a playground, Storybook, a component library or registry, or a template skeleton. It depends on an app framework (Next.js, Vite, React Router, Remix, TanStack Start or Router, Electron, Tauri, webpack, Rsbuild, Rspack, Expo). It is not a published library (`private` unset and `exports` or `module` set). It holds 50 or more `.tsx`/`.jsx` files outside tests and stories. Where a repository has several, the one with the most TSX/JSX files is measured. GitHub's "template repository" flag excludes the repository.
4. **Repository-level judgement**, applied in star order and listed below in full: exclude a repository whose main deliverable is a library, framework, SDK, CLI, component collection or curated list, because its Tailwind app is then a side tool, a demo or a marketing site. Also exclude repositories already in the quiet benchmark.
5. **The first 20** survivors in star order are the sample, and the next 5 are reserves.

The first run of step 3 counted any `main` field as a published library, and its framework list missed TanStack Router and `vite-plus`. That dropped two real apps: Responsively, an Electron app whose `main` is its main-process entry, and Reactive Resume. The rule was fixed and step 3 was re-run before the list was fixed. The scripts here are the fixed version.

### Every v4 repository above the cutoff that is not in the sample

The cutoff is the 20th app, Responsively, at 25,510 stars.

| Stars | Repository | Reason |
| ---: | --- | --- |
| 143,467 | vercel/next.js | Framework; its v4 package is the internal bundle analyzer (33 TSX/JSX files) |
| 127,114 | shadcn-ui/ui | Already in the quiet benchmark |
| 117,868 | immich-app/immich | Web UI is Svelte |
| 100,032 | ant-design/ant-design | Published library |
| 99,292 | mui/material-ui | v4 only in docs |
| 98,274 | tailwindlabs/tailwindcss | Framework; v4 only in playgrounds |
| 91,421 | storybookjs/storybook | v4 only in an eval harness (33 files) |
| 76,885 | heygen-com/hyperframes | Studio is a published library package |
| 73,419 | strapi/strapi | v4 package is a published library |
| 70,570 | code-yeongyu/oh-my-openagent | Judgement: CLI agent; `packages/web` is its docs and download site |
| 69,639 | remotion-dev/remotion | Judgement: video framework; `packages/convert` is a side tool |
| 53,266 | expo/expo | v4 only in docs |
| 50,931 | DavidHDev/react-bits | Judgement: component collection |
| 49,609 | calcom/cal.diy | Same repository as the quiet benchmark's `calcom/cal.com` (renamed; GitHub redirects) |
| 46,134 | fastapi/full-stack-fastapi-template | Template repository |
| 44,799 | meteor/meteor | v4 only in app skeletons |
| 44,240 | colinhacks/zod | v4 only in docs |
| 42,919 | FuelLabs/fuels-ts | SDK; v4 apps under 50 files |
| 42,720 | saadeghi/daisyui | Already in the quiet benchmark |
| 41,058 | styled-components/styled-components | v4 only in benchmarks |
| 40,515 | gitroomhq/postiz-app | Root `tailwindcss` is 3.4.17 |
| 40,057 | videojs/video.js | Judgement: player library; the v4 package is its skins |
| 38,921 | ant-design/ant-design-pro | Template repository |
| 38,448 | CopilotKit/CopilotKit | Published libraries |
| 38,348 | JCodesMore/ai-website-cloner-template | Template repository |
| 37,402 | can1357/oh-my-pi | CLI; web UI under 50 files |
| 37,127 | agentscope-ai/QwenPaw | v4 only in its website |
| 35,973 | refinedev/refine | Judgement: framework; the v4 package is its UI kit |
| 33,721 | vbenjs/vue-vben-admin | Vue; no TSX |
| 31,994 | Anil-matcha/Open-Generative-AI | `tailwindcss` 3.4 |
| 31,489 | supermemoryai/supermemory | v4 apps are playgrounds or under 50 files |
| 31,059 | transloadit/uppy | Component library |
| 30,862 | ComposioHQ/composio | v4 only in docs |
| 30,542 | better-auth/better-auth | v4 only in docs |
| 29,967 | labring/FastGPT | v4 only in docs |
| 29,613 | alibaba/page-agent | Judgement: library; the root package is its demo |
| 29,442 | nrwl/nx | Judgement: build tool; the v4 package is its website tooling |
| 29,252 | mastra-ai/mastra | Judgement: framework; `factory-ui` is an internal tool |
| 29,113 | requarks/wiki | Vue; no TSX |
| 28,855 | QwenLM/qwen-code | v4 package is a published library |
| 27,671 | vercel/ai | v4 only in docs and a published devtools package |
| 27,066 | bvaughn/react-virtualized | Published library |
| 26,979 | marmelab/react-admin | v4 only in docs |

## What is measured

**Files.** `.tsx` and `.jsx` under the app directory at the pinned commit, excluding `node_modules`, tests (`*.test.*`, `*.spec.*`, `__tests__`, `e2e`), stories (`*.stories.*`) and build output.

**Strings.** Every string literal and template-literal chunk, as `tailwind-class-use-scale` reads them today: `className`, `cn()`, `clsx()`, `cva()` and plain constants alike.

**Classes.** Spacing utilities with any variant prefix and an optional `!`:

- *Rhythm*: padding (`p`, `px`, `py`, `pt`, `pr`, `pb`, `pl`, `ps`, `pe`), margin (the same with `m`, including negatives), `gap`, `gap-x`, `gap-y`, `space-x`, `space-y`.
- *Position*: `inset`, `inset-x`, `inset-y`, `top`, `right`, `bottom`, `left`, `start`, `end`, `translate-x`, `translate-y`.

The go/no-go counts rhythm classes only. Position classes are reported separately, because an offset such as `top-[72px]` usually tracks a header height rather than the scale.

**Two forms per class.**

- *Bracketed*: `p-[13px]`, `gap-[0.8rem]`, `-mt-[6px]`. Only `px`, `rem` and `em` values count, at a 16px root. `var()`, `calc()`, percentages and keywords are skipped.
- *Step*: `p-3.25`, `gap-4.5`, `p-13`, read as the step number times the spacing base (`--spacing`, 0.25rem by default).

**Reference scale per app.**

- *Declared*: if the app's CSS sets `--spacing-*` tokens in `@theme`, their values join the scale. If it sets `--spacing` to anything other than `0.25rem`, the step list below is multiplied by that base instead of 4px.
- *Otherwise*: the default step list. These are the step names Tailwind v3 shipped and v4's documentation still shows: 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80 and 96. At the default base that is 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320 and 384px.

Tailwind v4 itself accepts any quarter step, so the default list is a stand-in for a team scale, not something v4 enforces. Results are split by declared and default so a reader can discount the default group.

**An off-scale finding** is a rhythm class whose px value is not on the app's reference scale (tolerance 0.01px). These are not findings: hairlines of 1px or less (the rules' `allowHairlines`), zero, and bracketed values that equal a scale step. A bracketed on-scale value such as `p-[12px]` is reported separately as an exact-equivalent rewrite.

**Copied components.** Files under `components/ui/` are usually copied from the shadcn/ui registry, not written by the team. Their findings are reported separately and left out of the go/no-go counts.

## Pass mark (from the plan, unchanged)

Build phase 1 only if both hold on 2026-11-15:

1. At least 10 of the 20 apps have one or more off-scale rhythm findings outside `components/ui/`.
2. A hand review of 50 findings rates at least 40 (80%) as drift a designer would fix.

Also reported, though not part of the pass mark: findings per 100 TSX/JSX files per app, the split between bracketed and step findings, and the split between declared and default scales. Criterion 1 is weak for large apps (Infisical has 3,025 files, and one stray value is likely), so the density figure and the review carry the weight in the write-up.

## The hand review

- **Sample.** 50 findings drawn with a fixed seed (`20261115`): at most 3 per app, chosen uniformly within each app. If the apps hold fewer than 50 eligible findings, all of them are reviewed.
- **Context.** Each finding is shown with its file, line, the surrounding class string, and the other spacing classes in the same element.
- **Rater.** The agent pre-rates each finding with a one-line reason. The maintainer gives the final rating, and the pass mark uses the maintainer's ratings. *(Replaced by amendment 3.)*
- **Rubric:**
  - *Drift*: an ordinary spacing value between two steps with no visible reason, which a designer would move to a step.
  - *Intentional*: tied to a constraint visible in the code or a comment. Examples are an icon or image size, border compensation (`p-[7px]` beside a 1px border to total 8), a third-party widget's size, or a pixel-matched asset.
  - *Undeclared token*: the same off-scale value used in 5 or more places in the app, acting as a token the theme does not declare.
  - *Unclear*.

  Only *Drift* counts toward the 40.

## Change log

- 2026-11-01: committed before measurement (#346).
- 2026-11-01, amendment 1, after the first run: strings that are SVG geometry do not count. That covers `d`, `points`, `viewBox`, `transform` and `path` attributes, and strings made only of path commands and numbers. A step-form finding also needs a class context (a class attribute or a `cn`/`clsx`/`cva`/`tv`/`twMerge`-style call) or a string of two or more tokens. **Why:** `d='M786 2713 c-184 …'` in Sim read as `m-234` and `m-329`, and a branch id `'pr-482'` in Appwrite read as padding. Effect: 704 findings became 700. Apps with findings: 15 of 20 before and after.
- 2026-11-01, amendment 2: the 3-per-app cap allows only 41 draws: 15 apps have findings, and two of them have one each (13 × 3 + 2). All 41 are reviewed, and the pass mark keeps its 80% ratio: 33 of 41. **Why:** the README promised both a cap and 50 findings, and the sample cannot meet both. Keeping the cap stops Sim and Reactive Resume (58% of findings) from dominating the review.
- 2026-11-01, amendment 3: the maintainer handed the rating to the agent. In place of the maintainer, a second rater (a fresh agent given only this rubric, the code and the repeat counts, not the first ratings) rated all 41 blind. The two raters agreed on 33 of 41 (Cohen's kappa 0.69). Each of the 8 disagreements was settled by checking the evidence the raters cited. In all 8, the blind rater had found a visible constraint the first rater missed (for example `ms-[68px]` = a `w-14` lane label plus `gap-3`), so the blind rating stands. **Effect:** drift went from 4 to 3 of 41. The first rater's ratings alone also fail the bar.
