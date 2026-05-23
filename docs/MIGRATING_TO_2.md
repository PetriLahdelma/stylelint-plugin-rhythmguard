# Migrating to Rhythmguard 2.0

Rhythmguard 2.0 stabilizes the audit contract for CI, dashboards, and generated reports.

## Audit JSON

`rhythmguard audit --format json` now emits the 2.0 contract:

```json
{
  "schemaVersion": "2.0",
  "command": {},
  "summary": {},
  "scanned": {},
  "contracts": {
    "scale": {},
    "tokens": {},
    "motion": {}
  },
  "findings": {
    "css": [],
    "tailwind": [],
    "motion": []
  },
  "baseline": null
}
```

Use `--format json-v1` while migrating scripts that still consume the pre-2.0 JSON shape.

## HTML and Output Files

Use `--format html --output rhythmguard-report.html` for a static design review report.

`--output <file>` works with `json`, `json-v1`, `markdown`, and `html`.

## Programmatic API

```js
const {
  createAuditReport,
  toAuditContractReport,
} = require('stylelint-plugin-rhythmguard/audit');

const report = await createAuditReport({ dir: './src', noConfig: true });
const contract = toAuditContractReport(report);
```

## Config

`.rhythmguardrc.json` is the recommended audit config surface:

```json
{
  "audit": {
    "ignore": ["legacy/**"],
    "tokenSources": ["./tokens.json"],
    "includeMotion": false,
    "minCleanliness": 90
  }
}
```

Run `npx rhythmguard doctor` to validate token sources, motion settings, and baseline files.
