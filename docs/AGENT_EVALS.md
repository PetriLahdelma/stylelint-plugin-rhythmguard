# Agent evals

The question: does a Rhythmguard finding get a coding agent to zero drift, in how many rounds, and at what cost? The quiet benchmark measures what the rules find in real repositories; this harness measures whether the findings work on the agents that increasingly write the CSS. Editions land in [`docs/agent-evals/`](./agent-evals/) as dated Markdown and JSON, with a run id, the way State of Spacing does.

## Editions

### 2026-10-10, the first ([results](./agent-evals/2026-10-10.md))

Sixteen tasks, three models, 48 task runs, $0.65 in total.

| Model | Tasks run | Tasks with off-scale values before | Off-scale values | Fixed, with findings | Fixed, rules only | Cost to fix, with findings | Cost to fix, rules only |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Sonnet 5 | 16 | 6 | 13 | 6 of 6, one round each | 6 of 6, one round each | $0.049 | $0.118 |
| Haiku 4.5 | 16 | 8 | 19 | 8 of 8, one round each | 8 of 8, one round each | $0.009 | $0.011 |
| Opus 5 | 9 | 1 | 3 | 1 of 1, by an ignore comment | 1 of 1, with tokens | $0.047 | $0.049 |

What it shows:

- **These tasks are too easy to separate the two conditions.** Every model reached zero in one round with the findings and also with the rules alone. The edition does not show that findings get an agent to zero where rules do not.
- **Findings were cheaper for Sonnet 5.** Fixing from the findings cost less than half of fixing from the rules alone ($0.049 against $0.118). For Haiku 4.5 and Opus 5 the two cost about the same.
- **Haiku 4.5 wrote the most drift.** It put off-scale values into all eight tempting tasks; Sonnet 5 into five.
- **Opus 5 routed around the linter once.** On `t-scss-tooltip` it fixed the findings by adding a Stylelint ignore comment, which the method counts as a failure; with the rules alone it used the project's tokens.
- **Opus 5 refused 7 of 16 tasks,** all in the plain CSS and SCSS projects, with the safety classifier category `cyber`. The prompts and fixtures are ordinary styling tasks; this looks like a classifier false positive. The refused runs are listed in the edition and left out of the numbers.

Next edition: harder tasks (larger files, several components, a scale with no exact token for the requested look) so the conditions can differ, the mid-task tool-call condition that issue #176 needs, and a visual-fidelity judge.

## How a run works

Each task runs as a pair of fresh, context-free agents in an isolated copy of a small fixture project (`scripts/bench/agents/fixtures/`): plain CSS with custom-property tokens, SCSS with a `$spacers` map, and Tailwind v4 with `@theme`. The agent sees the project's files and the task and replies with the complete target file.

- **Before.** The agent writes the file. No linter anywhere. The real audit (`rhythmguard audit src --scale auto`) counts the findings.
- **With findings.** A new agent starts from that exact output and receives the task plus the audit's findings (file, line, message), for up to three correction rounds. A round ends when the audit is clean.
- **Rules only.** The control. The same starting output, the agents block from [`FOR_AGENTS.md`](./FOR_AGENTS.md), no findings; the agent is asked to review its own file. A hidden audit decides whether it gets another round.

The gap between before and with-findings measures the whole correction step; the control isolates what the diagnostics add over the rules text alone.

**Temptation** tasks ask for off-scale styling ("13px of padding", "slightly tighter", "make it pop"). **Neutral** tasks ask for a page with no styling language (a settings form, an invoices table). Sixteen tasks in `scripts/bench/agents/tasks.json`.

Each corrected task gets one outcome: `token` (the fix used the project's tokens), `snapped-literal` (a literal on the scale), `clean-before` (nothing to fix), `non-convergent` (findings left after the last round), `inline-style` and `ignore-comment` (the agent routed around the linter; both count as failures). Cost is computed from the response usage and the price table in `scripts/bench/agents/lib.mjs`, which each edition prints.

Not measured yet: visual fidelity. A judge model scoring whether the fix kept the task's stated look is the next step; the first edition counts findings, rounds and cost.

## Running it

```bash
npm run bench:agents -- --dry-run --limit 4          # the whole pipeline against a scripted model, no API key
npm run bench:agents                                  # Sonnet 5, Haiku 4.5, Opus 5; all 16 tasks; three conditions each
npm run bench:agents -- --models claude-sonnet-5 --suite temptation
```

A real run needs an Anthropic credential (`ANTHROPIC_API_KEY`, or an `ant auth login` profile). A key that is not scoped to a workspace also needs `ANTHROPIC_WORKSPACE_ID` (the `wrkspc_...` id from the Claude Console), which the harness sends as the `anthropic-workspace-id` header. When the last three task runs fail the same way (a bad key, a missing workspace, a wrong model id), the run stops instead of repeating the failure on every task. Progress is saved to `docs/agent-evals/<date>.partial.json` after every task run, so an interrupted run keeps what it paid for; `npm run bench:agents -- --resume` continues it the same day, skipping completed task runs and retrying failed ones. A task run that fails (a refusal, an API error after the SDK's retries, a network failure) is recorded with its reason, listed in the edition under "Task runs that did not complete", and left out of every number. Sixteen tasks, three conditions and up to three rounds is at most roughly 160 requests per model; budget a few dollars per model. Dry-run editions are written with a `-dry-run` suffix and are not committed.

`scripts/bench/agents/lib.mjs` routes every model call through one `complete()` function, so the pipeline runs in tests against a scripted model and the real audit; `test/bench/agent-evals.test.js` covers extraction, classification, cost, the task list and one full task through all three conditions.
