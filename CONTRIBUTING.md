# Contributing

Thanks for contributing to `stylelint-plugin-rhythmguard`.

## Development Setup

```bash
npm ci
npm run lint
npm test
```

Optional checks:

```bash
npm run test:compat-floor
npm run test:coverage
npm run test:pack-smoke
npm run scales:validate
```

## Community Scale Contributions

Rhythmguard accepts community presets through JSON files in `scales/community`.

Create a new scale file:

```bash
npm run scales:add -- --name my-team-scale --base 8 --steps 0,4,8,12,16,24,32
```

Then validate:

```bash
npm run scales:validate
```

Scale files must pass schema and collision checks. See [`docs/COMMUNITY_SCALES.md`](./docs/COMMUNITY_SCALES.md) for the full spec and policy.

## Compatibility Targets

- Stylelint `^16.0.0 || ^17.0.0`. Stylelint `16.0.0` has known autofix and API differences; CI runs the floor-compat suite against it and the full suite non-blocking.
- Node `>=18.18.0` for Stylelint 16, `>=20.19.0` for Stylelint 17. The CI matrix excludes Node 18 with Stylelint 17.
- Dual CommonJS and ESM entry points; every export has a declaration under `types/`. `npm run typecheck` compiles the declarations, a consumer check file, and the examples.

## Performance Benchmarking

```bash
npm run bench:perf
npm run bench:perf:fix
```

Compares runtime against `stylelint-scales` on a deterministic corpus. Method and arguments: [`docs/BENCHMARKING.md`](./docs/BENCHMARKING.md).

## Semver Rules

- Patch (`x.y.Z`): bug fixes, docs updates, non-breaking internal changes.
- Minor (`x.Y.z`): backward-compatible new options, presets, or behavior.
- Major (`X.y.z`): any breaking behavior change for existing rules/configs.

Breaking examples:

- changing default scale behavior
- changing autofix behavior in a non-compatible way
- changing/removing exported config entry points

## Rule Change Requirements

When changing rule logic:

1. add/adjust tests for the behavior
2. validate deterministic fix behavior
3. update the rule's page in `docs/rules/` if options or behavior changed
4. update CHANGELOG
5. run the quiet benchmark: `npm run bench:quiet -- --check`. It audits real public design systems at pinned commits and fails when the finding set or the inferred scale changes. If the change is intended, review the printed diff, run `npm run bench:quiet -- --update-snapshots`, and commit `benchmarks/quiet/snapshots/` with a sentence in the PR on why the new findings are right. CI runs the same check.

## Release Workflow

1. Run the local gate: `npm run lint && npm run typecheck && npm test && npm run test:pack-smoke`.
2. Update `CHANGELOG.md` and bump `package.json`.
3. Create a GitHub release. `release.yml` runs the Node and Stylelint matrix on the self-hosted runners, then publishes to npm with provenance when `NPM_TOKEN` is configured, or skips publish with a notice when it is not.
4. `post-publish-smoke.yml` installs the published version in a clean project.

Keep `configs/recommended` and `configs/strict` stable across minors. Rule docs live in `docs/rules/`; a test checks that every rule's `meta.url` points at its page.
