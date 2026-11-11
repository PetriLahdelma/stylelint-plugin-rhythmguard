# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 3.x | Yes |
| 2.x | Security fixes only until 2027-03-01 |
| < 2.0 | No, upgrade to 3.x |

## What this package does on your machine

This applies to all three packages: `stylelint-plugin-rhythmguard`, `rhythmguard` and `eslint-plugin-rhythmguard`.

- **No network requests and no telemetry.** Nothing in the packages opens a connection, and nothing is collected or sent. `test/contracts/no-network.test.js` fails the build if any source file imports a network module or calls `fetch`.
- **No install scripts.** None of the three packages runs code when it is installed.
- **It reads** the stylesheets and class-string files it lints or audits, the token files and packages you point it at (`scaleSources`, `tokenMapFile`, `--token-source`, `.rhythmguardrc.json`), and installed design-token packages that your `package.json` lists directly.
- **It runs one file of yours as code, and only when you ask.** With `tailwindConfigPath` set in a Stylelint config, the rules load that Tailwind config with `require()` to read `theme.spacing`; `rhythmguard audit` does the same only with `--tailwind-config <file>` on the command line, never from `.rhythmguardrc.json`, so a file in a repository cannot make the audit run code. A config that uses top-level await is not loaded. To avoid running it at all, point `scaleSources` at the CSS it builds instead.
- **It starts one program: `git`,** and only for `rhythmguard audit --since` and `--staged`, to list changed files and read staged contents. The source test above allows no other process.
- **It writes files only when you ask:** `stylelint --fix` and `eslint --fix` through the host linter, `rhythmguard fix --write`, `audit --write-baseline` and `audit --output <file>`, and `rhythmguard init`, which asks before writing a config or agent files.
- **Provenance.** Every release is published from this repository's `release.yml` through npm trusted publishing, with no npm token anywhere, and carries an npm provenance attestation. Check it with `npm audit signatures` in a project that installs the package, or `npm view stylelint-plugin-rhythmguard dist.attestations`.
- **CI.** The workflows pin every action by commit digest, give the token read-only permissions unless a job needs more, and do not leave credentials in the checkout. The CI result collector in `.github/scripts/report-ci.sh` reports this repository's own job results to the maintainer's dashboard; it is not part of any package.

## Reporting a Vulnerability

Please do **not** open public GitHub issues for security reports.

Use one of these channels:

1. GitHub private vulnerability reporting (preferred): open a GitHub Security Advisory draft in this repository.
2. Email: `hello@petrilahdelma.com`

Please include:

- affected version
- reproduction steps or proof of concept
- impact assessment
- any suggested mitigation

## Response Targets

- Initial acknowledgment: within 72 hours
- Triage decision: within 7 days
- Remediation/release timeline: communicated after triage based on severity and exploitability
