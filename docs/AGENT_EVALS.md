# Agent evals

The question: does a Rhythmguard finding get a coding agent to zero drift, in how many rounds, and at what cost? The quiet benchmark measures what the rules find in real repositories; this harness measures whether the findings work on the agents that increasingly write the CSS. Editions land in [`docs/agent-evals/`](./agent-evals/) as dated Markdown and JSON, with a run id, the way State of Spacing does.

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

A real run needs an Anthropic credential (`ANTHROPIC_API_KEY`, or an `ant auth login` profile). Sixteen tasks, three conditions and up to three rounds is at most roughly 160 requests per model; budget a few dollars per model. Dry-run editions are written with a `-dry-run` suffix and are not committed.

`scripts/bench/agents/lib.mjs` routes every model call through one `complete()` function, so the pipeline runs in tests against a scripted model and the real audit; `test/bench/agent-evals.test.js` covers extraction, classification, cost, the task list and one full task through all three conditions.
