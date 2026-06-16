#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createAuditReport, toAuditContractReport } from 'stylelint-plugin-rhythmguard/audit';

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--')) {
    return fallback;
  }

  return argv[index + 1];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectFindings(findings) {
  return [
    ...(findings.css || []),
    ...(findings.tailwind || []),
    ...(findings.motion || []),
  ];
}

function renderMetric(label, value) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function renderDashboard(contract) {
  const findings = collectFindings(contract.findings);
  const topFindings = findings.slice(0, 12);
  const cleanliness = contract.contracts.scale.cleanliness;
  const score = typeof cleanliness === 'number' ? cleanliness : contract.summary.cleanliness;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rhythmguard Audit Dashboard</title>
<style>
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;margin:0;background:#f7f8fa;color:#111827;}
main{max-width:1120px;margin:0 auto;padding:32px 20px;}
h1{font-size:28px;margin:0 0 8px;}
p{color:#4b5563;margin:0 0 24px;}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0;}
.metric{border:1px solid #d8dde5;background:#fff;border-radius:8px;padding:16px;}
.metric span{display:block;color:#6b7280;font-size:12px;text-transform:uppercase;}
.metric strong{display:block;font-size:28px;margin-top:8px;}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d8dde5;border-radius:8px;overflow:hidden;}
th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:10px 12px;font-size:14px;}
th{background:#f1f5f9;color:#374151;font-size:12px;text-transform:uppercase;}
tr:last-child td{border-bottom:0;}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;}
</style>
</head>
<body>
<main>
<h1>Rhythmguard Audit Dashboard</h1>
<p>${escapeHtml(contract.command.directory)} · ${escapeHtml(contract.command.scanScope)} · schema ${escapeHtml(contract.schemaVersion)}</p>
<section class="metrics">
${renderMetric('Scale cleanliness', `${score ?? 100}%`)}
${renderMetric('CSS files', contract.scanned.cssFiles)}
${renderMetric('Template files', contract.scanned.templateFiles)}
${renderMetric('Findings', findings.length)}
</section>
<table>
<thead><tr><th>Type</th><th>File</th><th>Value</th><th>Message</th></tr></thead>
<tbody>
${topFindings.map((finding) => `<tr><td>${escapeHtml(finding.type)}</td><td><code>${escapeHtml(finding.file)}</code></td><td><code>${escapeHtml(finding.value || finding.rawValue || '')}</code></td><td>${escapeHtml(finding.message || '')}</td></tr>`).join('\n')}
</tbody>
</table>
</main>
</body>
</html>`;
}

const argv = process.argv.slice(2);
const dir = readOption(argv, '--dir', argv.find((arg) => !arg.startsWith('--')) || 'src');
const output = readOption(argv, '--output', 'rhythmguard-dashboard.html');
const includeMotion = argv.includes('--include-motion');

const report = await createAuditReport({ dir, includeMotion });
const contract = toAuditContractReport(report);
const outputPath = path.resolve(process.cwd(), output);

fs.writeFileSync(outputPath, renderDashboard(contract));
process.stdout.write(`Wrote ${outputPath}\n`);
