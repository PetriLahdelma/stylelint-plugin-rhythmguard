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
3. update README option or behavior docs if needed
4. update CHANGELOG

## Release Notes

- Keep `stylelint-plugin-rhythmguard/configs/recommended` and `stylelint-plugin-rhythmguard/configs/strict` stable.
- Verify CI matrix is green before publishing.
- Publish with provenance through the release workflow.
