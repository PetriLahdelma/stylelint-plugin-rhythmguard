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
```

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
- The `Post Publish Smoke` workflow, which installs the published package into a clean project, is green.

## 6. If the run fails before publish

Nothing was published, so keep the version number. Fix on `main`, then move the release to the fixed commit:

```bash
gh release delete vX.Y.Z --yes --cleanup-tag
gh release create vX.Y.Z --target <new-sha> --title vX.Y.Z --notes-file notes.md
```

Release-event workflows run the workflow file at the tag, so the tag must point at the fixed commit.

## 7. Afterwards

- Refresh the README banner if the version is drawn on it (`assets/rhythmguard-banner.svg`), bumping the `?v=` cache key on its URL in `README.md` and `docs/index.html`.
- Add a wiki capture or changelog note for anything a future maintainer would need to know.
