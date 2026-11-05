# Metrics

The numbers the checkpoints in [`COUNCIL_2027-2028.md`](./COUNCIL_2027-2028.md) read (Amendment 2). One row a week from `node scripts/metrics/aged-downloads.mjs --write`.

**Unit.** npm's last-week downloads per version, counting only versions published 14 or more days earlier ("aged"), which strips our own release and smoke runs, minus a pin: one aged version that alone is more than half of the week, which only a single lockfile running CI produces. On 2026-11-05 that was `stylelint-plugin-rhythmguard@3.6.0`, 2,016 of 3,389 downloads, from one external team's lockfile. The cell is the aged ex-pin figure; the parentheses keep the raw week, the aged total and the pin so the removal stays visible.

## Aged weekly downloads, pin removed

| Date | stylelint-plugin-rhythmguard | rhythmguard | eslint-plugin-rhythmguard |
| --- | --- | --- | --- |
| 2026-11-05 | 435 (week 3389, aged 2451, pin 3.6.0 2016) | 5 (week 740, aged 5, pin none) | 4 (week 642, aged 4, pin none) |
