# When the maintainer is away

Rhythmguard has one maintainer. This page is for whoever keeps it running while they are away for weeks: a collaborator with write access to this repository, or the maintainer coming back. It says what can be done without them, and how.

## Who can do what

| Task | Needs |
| --- | --- |
| Merge a pull request | Write access to this repository |
| Publish a release of all three packages | Write access: creating a GitHub release runs `release.yml`, which publishes through npm trusted publishing. No npm token or npm account is involved |
| Deprecate a broken version on npm | An npm maintainer on the three packages (`npm deprecate <pkg>@<version> "<reason>"`) |
| Change repository variables (`HOSTED_GATE`, `RELEASE_ON_FARM`, `PUBLISH_COMPANIONS`) | Admin |
| Answer a security report | Anyone with write access can acknowledge it; [`SECURITY.md`](../SECURITY.md) promises an acknowledgement within 72 hours |

## Ship a fix

1. Branch from `main`, fix, and add a line under `## [Unreleased]` in `CHANGELOG.md`.
2. Run the local gate: `npm run check`, `npm run test:compat-floor`, `npm run build:playground` (commit the bundle if it changed), and `npm_config_registry=https://registry.npmjs.org npm run test:pack-smoke`. Every command must exit 0.
3. Merge the pull request. Do not wait for pull-request checks: the local gate is the merge gate.
4. Cut the release on a branch with `node scripts/release/prepare.mjs X.Y.Z`, which makes every version edit and runs the gate again; merge that pull request too.
5. `gh release create vX.Y.Z --target <merge-sha> --title vX.Y.Z --notes-file .release-notes.md`.
6. Check that `release.yml` and `Post Publish Smoke` are green, and that `npm view stylelint-plugin-rhythmguard@X.Y.Z version` answers. [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) has the details and the failure cases.

The release verify and the post-publish smoke run on GitHub-hosted runners, so a release does not depend on the maintainer's machines.

## The self-hosted farm

Pull requests and pushes to `main` run the CI matrix on runners on the maintainer's own hardware (a Mac mini and a gaming PC). When those machines are off, those jobs queue and nothing else breaks: with the repository variable `HOSTED_GATE` set to `true`, pull requests get a GitHub-hosted fast gate instead, and releases are hosted anyway. Restarting a farm runner needs physical or remote access to those machines, which only the maintainer has. A Mac mini runner needs `colima start` after a reboot.

## Renovate

Renovate opens dependency pull requests, often two a day. Review them like any other: run the local gate on the branch and merge. Pull requests that touch `benchmarks/tailwind-compare/package.json` arrive without their lockfile, because Renovate's npm refuses a remote tarball in that tree. On the branch, merge `main`, run `npm install --registry https://registry.npmjs.org` in that directory, rerun `node scripts/bench/tailwind-compare.mjs`, check that `RESULTS.md` changed only in versions and the date, confirm `npm ci` works there, then push and merge. A major bump of TypeScript in `benchmarks/tailwind-v4/packages` must be closed: that package pins TypeScript 5.9.3 on purpose.

## Stylelint, ESLint or Oxlint majors

The weekly "Hosts at latest" workflow runs the suite against the newest Stylelint, ESLint and Oxlint. If a new major ships and that job is green, widen the peer range the same week, as 3.18.0 did for Stylelint 18: the range lives in `package.json` (`peerDependencies.stylelint`) and must match `packages/rhythmguard/package.json` (`dependencies.stylelint`; a contract test checks it). Add the major to the CI matrix in `ci.yml` and `release.yml`, and to `stylelintSmokeInstalls()` in `scripts/ci/smoke-checks.mjs`.

## What not to do while the maintainer is away

- Do not open issues or pull requests in other repositories about their code, and do not reply on the audit issues listed in [`outreach/embed-log.md`](./outreach/embed-log.md). Replies there go out only after the maintainer has read them.
- Do not change message text in a patch release, and do not add rule options: [`COUNCIL_2027-2028.md`](./COUNCIL_2027-2028.md) (Amendment 2) sets what a 3.x minor may change.
- Do not publish more than one release in 24 hours unless the earlier one is broken.
