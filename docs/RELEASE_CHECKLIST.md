# Release checklist

Releases are maintainer-run and take about twenty minutes of attention. The publish itself is automated: a GitHub release triggers `release.yml`, which verifies on the self-hosted matrix (Node 20 and 22 against Stylelint 16.0.0, 16 and 17) and publishes from a GitHub-hosted job through npm trusted publishing (OIDC). No npm token exists anywhere. Provenance is attached automatically.

## 1. Decide the version

- Patch: fixes, docs, internal changes.
- Minor: new options, sources, packages, formats, or behaviour that does not change existing reports.
- Major: a change to default reports, to autofix output, or to exported entry points. Write `docs/MIGRATING_TO_<n>.md` first.

## 2. Cut it on a branch

```bash
git checkout -b release/vX.Y.Z origin/main
npm version X.Y.Z --no-git-tag-version
npm version X.Y.Z --no-git-tag-version --prefix packages/rhythmguard
npm version X.Y.Z --no-git-tag-version --prefix packages/eslint-plugin-rhythmguard
```

Then set `dependencies["stylelint-plugin-rhythmguard"]` to `^X.Y.Z` in both `packages/*/package.json`. A contract test fails if any version or that range disagrees.

Rename the `## [Unreleased]` section of `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD`, leaving an empty `## [Unreleased]` above it.

## 3. Run the local gate

```bash
npm run lint
npm run typecheck
npm test
npm run test:compat-floor
npm_config_registry=https://registry.npmjs.org npm run test:pack-smoke
```

All five must exit 0. If your change could move benchmark findings, `npm run bench:quiet -- --check` too.

## 4. Merge and release

Open the PR, merge it, then create the release against the merge commit:

```bash
gh release create vX.Y.Z --target <merge-sha> --title vX.Y.Z --notes-file notes.md
```

The notes are the changelog section rewritten for a reader who has not followed the repository, with an upgrade line at the end.

## 5. Verify

- `gh run list --workflow release.yml --limit 1`: all verify jobs and `publish` green.
- `npm view stylelint-plugin-rhythmguard@X.Y.Z version dist-tags.latest dist.attestations`: the version is `latest` and carries SLSA provenance.
- The `Post Publish Smoke` workflow, which waits for the registry to list the version and installs it into a clean project, is green. Check its log says the smoke ran, not that it skipped.

## 6. Companion packages

Two more packages publish from this repository, by the same release run, after the registry lists the main version:

- `rhythmguard` (`packages/rhythmguard`): the command name, so `npx rhythmguard` works in a project that has installed nothing. One dependency, one line.
- `eslint-plugin-rhythmguard` (`packages/eslint-plugin-rhythmguard`): the ESLint companion under its own name.

The steps are gated on the repository variable `PUBLISH_COMPANIONS`. Two one-time steps before setting it, for each package:

1. First publish by hand, since npm trusted publishing can only be configured on a package that exists: `cd packages/<name> && npm publish --access public --registry https://registry.npmjs.org` with your npm login and OTP.
2. On npmjs.com, package settings, add a trusted publisher: repository `PetriLahdelma/stylelint-plugin-rhythmguard`, workflow `release.yml`.

Then `gh variable set PUBLISH_COMPANIONS --body true`. Until then the steps are skipped and the release is unaffected.

## 7. If the farm is down

Check the runners before cutting: `gh api repos/PetriLahdelma/stylelint-plugin-rhythmguard/actions/runners --jq '.runners[] | "\(.name) \(.status)"'`. No runner listed, or all offline, means the verify jobs will queue for 24 hours and be cancelled. Flip the release onto GitHub-hosted runners for the cut, and back afterwards:

```bash
gh variable set RELEASE_ON_HOSTED --body true
gh variable delete RELEASE_ON_HOSTED
```

The variable is read when the run starts, so set it before creating the release. The publish job is always GitHub-hosted (OIDC requires it).

## 8. If the run fails before publish

Nothing was published, so keep the version number. Fix on `main`, then move the release to the fixed commit:

```bash
gh release delete vX.Y.Z --yes --cleanup-tag
gh release create vX.Y.Z --target <new-sha> --title vX.Y.Z --notes-file notes.md
```

Release-event workflows run the workflow file at the tag, so the tag must point at the fixed commit.

## 9. Afterwards

- Refresh the README banner if the version is drawn on it (`assets/rhythmguard-banner.svg`), bumping the `?v=` cache key on its URL in `README.md` and `docs/index.html`.
- Add a wiki capture or changelog note for anything a future maintainer would need to know.
