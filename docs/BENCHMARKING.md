# Benchmarking

This repository includes a reproducible benchmark harness to compare spacing-rule runtime between:

- `rhythmguard/use-scale`
- `stylelint-scales` (`scales/space`)

## Run

```bash
npm run bench:perf
```

Run with autofix enabled:

```bash
npm run bench:perf:fix
```

## Custom Inputs

```bash
node scripts/bench/compare.mjs --selectors 6000 --decls 8 --iterations 10 --warmup 3 --seed 1337
```

Options:

- `--selectors` number of generated CSS selectors (default `4000`)
- `--decls` spacing declarations per selector (default `6`)
- `--iterations` measured iterations per plugin (default `8`)
- `--warmup` warm-up iterations per plugin (default `2`)
- `--seed` deterministic corpus seed (default `1337`)
- `--fix` benchmark with Stylelint autofix enabled

## Methodology

- Both plugins run on the same generated corpus.
- The corpus is deterministic via seed.
- Rules are configured for overlap fairness:
  - `stylelint-scales`: `scales/space`
  - `rhythmguard`: `rhythmguard/use-scale` restricted to the same property family (`inset|gap|margin|padding`).
- Timing stats include `mean`, `median`, `p95`, and `stddev`.

## Output

Each run writes JSON to:

`benchmarks/latest.json`

That output is designed for CI attachments, release notes, and historical comparisons.
