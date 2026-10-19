# DTCG 2025.10 test-suite fixtures (vendored)

These JSON files are a subset of the Design Tokens Community Group conformance
fixtures. `test/unit/dtcg-test-suite.test.js` reads them through the token
source reader (issue #163).

- Upstream repository: https://github.com/design-tokens/community-group
- Upstream path: `test-suite/tests/2025.10/format/`
- Upstream commit: `8e4381962f2589bcb359dab38c6664dbb1e1058f` (the merge of design-tokens/community-group#413, which added the suite)
- License: W3C 3-clause BSD License, see [LICENSE.md](./LICENSE.md)

The files are byte-for-byte copies, at the same paths below `tests/2025.10/format/`
as upstream. Nothing here is modified.

## What is vendored

- `manifest.json`: the whole format manifest, unmodified (all 220 entries; the
  test only looks up the entries whose fixtures are vendored here).
- Every case under `positive/dimensions/` and `negative/dimensions/`.
- Every case under `positive/references/` and `negative/references/` with a
  token whose `$type` is `dimension`:
  - positive: `composite-with-refs`, `composite-subvalue-refs`,
    `cross-composite-refs`, `nested-composite-refs`, `typography-property-refs`
  - negative: `circular-reference-chain`, `composite-ref-wrong-subvalue-type`,
    `dimension-curly-brace-in-subvalue`, `json-pointer-incomplete-dimension`,
    `json-pointer-type-mismatch`, `json-pointer-wrong-property`,
    `reference-type-mismatch`

Cases about colors, typography, shadows and other non-length types are not
vendored: Rhythmguard reads spacing lengths only.

## Updating

Fetch each file from
`https://raw.githubusercontent.com/design-tokens/community-group/<commit>/test-suite/tests/2025.10/format/<path>`,
replace the files here, update the commit above and in the test file header,
and map any new dimension case in the test. The fixtures are data only; nothing
from the upstream repository is executed.
