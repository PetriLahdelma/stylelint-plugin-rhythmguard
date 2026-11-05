# Release checklist

Releases are maintainer-run and take about twenty minutes of attention. The publish itself is automated: a GitHub release triggers `release.yml`, which verifies on GitHub-hosted runners (Node 22 against Stylelint 16.7.0, 16, 17 and 18, Node 24 and 26 against 18, Node 20 against the 16.7.0 floor) and publishes from a GitHub-hosted job through npm trusted publishing (OIDC). No npm token exists anywhere. Provenance is attached automatically.

## 1. Decide the version

- Patch: fixes, docs, internal changes.
- Minor: new options, sources, packages, formats, or behaviour that does not change existing reports.
- Major: a change to default reports, to autofix output, or to exported entry points. Write `docs/MIGRATING_TO_<n>.md` first.

## 2. Cut it on a branch, with the local gate

```bash
git checkout -b release/vX.Y.Z origin/main
node scripts/release/prepare.mjs X.Y.Z
```

`scripts/release/prepare.mjs` sets the version in `package.json`, both places in `package-lock.json` and both `packages/*/package.json` (with their `^X.Y.Z` range on the plugin), bumps the README badge's `r=` key, moves the `## [Unreleased]` section of `CHANGELOG.md` under `## [X.Y.Z] - <today>` with an empty `## [Unreleased]` above it, and writes that section to `.release-notes.md`. Then it runs the local gate: lint, typecheck, tests, the Stylelint floor, the playground bundle (it must already be committed fresh) and the pack smoke on the public registry. It stops on the first failure.

It refuses a version that is not above the current one, an empty `[Unreleased]` section, and a release within 24 hours of the last one on npm: seven versions in four days read as churn. `--allow-within-24h` is for a fix to a broken release only. `--no-gate` makes the edits without the gate, `--date` and `--notes <file>` override the defaults. If your change could move benchmark findings, run `npm run bench:quiet -- --check` too.

## 3. Write the notes

Edit `.release-notes.md` into notes for a reader who has not followed the repository, with an upgrade line at the end. It is ignored by git.

## 4. Merge and release

Open the PR, merge it, then create the release against the merge commit:

```bash
gh release create vX.Y.Z --target <merge-sha> --title vX.Y.Z --notes-file .release-notes.md
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

1. First publish by hand, since npm trusted publishing can only be configured on a package that exists: `npm login --registry https://registry.npmjs.org`, then `cd packages/<name> && npm publish --access public --provenance=false --registry https://registry.npmjs.org` with your OTP. `--provenance=false` is required: both packages set `publishConfig.provenance`, which only works inside a CI run with OIDC, so a publish from a laptop fails without it. Releases after this one publish from `release.yml` with provenance.
2. On npmjs.com, package settings, add a trusted publisher: repository `PetriLahdelma/stylelint-plugin-rhythmguard`, workflow `release.yml`. It needs the **publish** permission, not only stage publish. From the command line (npm 12 or newer), run from your home folder, since a project `.npmrc` with `userconfig=` redirects the login and every call then fails with 401: `npx -y npm@12 trust github <name> --repo PetriLahdelma/stylelint-plugin-rhythmguard --file release.yml --allow-publish --registry https://registry.npmjs.org`. `npx -y npm@12 trust list <name>` should show `permissions: publish, stage publish`.

Then `gh variable set PUBLISH_COMPANIONS --body true`. Until then the steps are skipped and the release is unaffected.

## 7. Where the release runs

The verify matrix and the post-publish smoke run on GitHub-hosted runners, so a release no longer waits for the self-hosted farm (it queued for 30 to 68 minutes behind CI, and 24 hours when the farm was down). To run them on the farm instead, for example while GitHub has an outage, set the variable before creating the release and delete it afterwards:

```bash
gh variable set RELEASE_ON_FARM --body true
gh variable delete RELEASE_ON_FARM
```

The variable is read when the run starts. The publish job is always GitHub-hosted (OIDC requires it).

## 7b. If only the companions failed

The last publish step fails the run when any of the three packages is missing at the release version, so a lagging companion cannot go unnoticed. A 403 "OIDC permission denied for this action" on a companion means its trusted publisher lacks the publish permission (section 6, step 2): revoke it with `npx -y npm@12 trust revoke <name> --id=<id>` and add it again with `--allow-publish`. That is what kept both companions at 3.8.0 from 3.9.0 to 3.14.0.

Each publish step skips a version npm already lists, so a release run that published the main package and failed on a companion (a trusted publisher missing on npmjs.com) is finished by a manual run once the publisher is set up: `gh workflow run release.yml --ref main`. It verifies again and publishes only what is missing. A new trusted publisher shows "not yet validated" until its first publish.

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
