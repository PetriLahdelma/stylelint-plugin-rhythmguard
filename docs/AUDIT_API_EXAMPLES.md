# Audit API Examples

Rhythmguard 2.0 exposes the audit contract through `stylelint-plugin-rhythmguard/audit` so teams can build dashboards, reports, and design-tool handoffs without scraping CLI text.

## Static dashboard

Generate a dependency-free HTML dashboard:

```bash
node examples/audit-dashboard.mjs --dir ./src --output rhythmguard-dashboard.html
```

Include motion findings when you are evaluating motion rhythm:

```bash
node examples/audit-dashboard.mjs --dir ./src --include-motion --output rhythmguard-dashboard.html
```

The script calls:

```js
import { createAuditReport, toAuditContractReport } from 'stylelint-plugin-rhythmguard/audit';

const report = await createAuditReport({ dir: './src', includeMotion: true });
const contract = toAuditContractReport(report);
```

## Figma-friendly export

Generate a compact JSON payload for Figma/FigJam plugin experiments or manual design-system review:

```bash
node examples/audit-figma-export.mjs --dir ./src --include-motion --output rhythmguard-figma-export.json
```

The export intentionally stays small:

- `summaryCards`: values that can become dashboard tiles.
- `charts.findingsByType`: grouped issue counts.
- `charts.findingsByFile`: top affected files.
- `findings`: capped finding details for annotation layers or FigJam tables.

This is a bridge format, not a full Figma plugin API. Keep the stable source of truth as the Audit 2.0 JSON contract and derive design-tool payloads from it.
