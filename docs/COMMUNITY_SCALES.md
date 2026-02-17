# Community Scales

Rhythmguard supports a curated community scale registry in `scales/community`.

## Scale Spec

Each scale is a JSON file validated against `schemas/community-scale.schema.json`.

Required fields:

- `name`: preset id (`kebab-case`)
- `description`: one-line use-case summary
- `base`: baseline unit in px
- `steps`: ascending scale values in px (must start with `0`)

Optional fields:

- `aliases`: shorthand preset aliases
- `tags`: discoverability tags
- `contributor`: display name
- `contributorUrl`: profile link

## Add a Scale

1. Scaffold a file:

```bash
npm run scales:add -- --name my-team-scale --base 8 --steps 0,4,8,12,16,24,32
```

2. Edit the generated JSON in `scales/community/`.
3. Validate all community scales:

```bash
npm run scales:validate
```

4. Open a pull request.

## Validation Rules

- no duplicate scale names
- no collisions with core preset names
- no duplicate aliases
- no alias collisions with existing preset names
- steps must be strictly increasing and start with `0`
- values must be finite non-negative numbers

## User-Land (No PR) Custom Scales

If you do not want to contribute to the shared registry, use local project config:

```json
{
  "rules": {
    "rhythmguard/use-scale": [true, { "customScale": [0, 6, 12, 18, 24, 36, 48] }]
  }
}
```

This keeps your private or niche scale in your own repo while still getting full Rhythmguard enforcement.
