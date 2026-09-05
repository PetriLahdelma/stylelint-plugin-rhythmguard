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

1. Publishing is done by `release.yml` through npm trusted publishing (OIDC). The trusted publisher on npmjs.com is bound to `PetriLahdelma/stylelint-plugin-rhythmguard` and the workflow file `release.yml`; no npm token is stored anywhere.
2. The publish job must run on a GitHub-hosted runner (npm does not support trusted publishing from self-hosted runners). Provenance is attached automatically.
3. Verify package metadata, provenance badge and README on npm.

## Post-release

1. Smoke-test install in clean project:
   - `npm i -D stylelint stylelint-plugin-rhythmguard`
2. Validate both configs:
   - `stylelint-plugin-rhythmguard/configs/recommended`
   - `stylelint-plugin-rhythmguard/configs/strict`
3. Open tracking issue for next version scope.
