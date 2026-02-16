# Release Checklist

## Pre-release

1. Run `npm ci`.
2. Run `npm run lint`.
3. Run `npm test`.
4. Confirm README links and examples still match exported rule names.
5. Confirm `package.json` version and changelog notes.

## GitHub Release

1. Create/update tag (example: `v0.1.0`).
2. Push `main` and tag.
3. Create a GitHub Release from the tag with:
   - summary of changes
   - upgrade notes
   - migration notes if rule defaults changed

## npm Publish

1. Confirm `NPM_TOKEN` exists in repo secrets.
2. Publish via GitHub Release workflow (`release.yml`) or run local publish:
   - `npm publish --provenance`
3. Verify package metadata and README on npm.

## Post-release

1. Smoke-test install in clean project:
   - `npm i -D stylelint stylelint-plugin-rhythmguard`
2. Validate both configs:
   - `stylelint-plugin-rhythmguard/configs/recommended`
   - `stylelint-plugin-rhythmguard/configs/strict`
3. Open tracking issue for next version scope.
