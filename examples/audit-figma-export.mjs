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

function collectFindings(findings) {
  return [
    ...(findings.css || []),
    ...(findings.tailwind || []),
    ...(findings.motion || []),
  ];
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
}

function buildFigmaPayload(contract) {
  const findings = collectFindings(contract.findings);
  const cleanliness = contract.contracts.scale.cleanliness;

  return {
    schema: 'rhythmguard.figma-export.v1',
    generatedAt: new Date().toISOString(),
    source: {
      directory: contract.command.directory,
      scanScope: contract.command.scanScope,
      schemaVersion: contract.schemaVersion,
    },
    summaryCards: [
      {
        label: 'Scale cleanliness',
        value: `${typeof cleanliness === 'number' ? cleanliness : contract.summary.cleanliness ?? 100}%`,
      },
      { label: 'CSS files', value: contract.scanned.cssFiles },
      { label: 'Template files', value: contract.scanned.templateFiles },
      { label: 'Findings', value: findings.length },
    ],
    charts: {
      findingsByType: countBy(findings, (finding) => finding.type),
      findingsByFile: countBy(findings, (finding) => finding.file).slice(0, 10),
    },
    findings: findings.slice(0, 25).map((finding) => ({
      file: finding.file,
      line: finding.line || null,
      message: finding.message || '',
      type: finding.type,
      value: finding.value || finding.rawValue || null,
    })),
  };
}

const argv = process.argv.slice(2);
const dir = readOption(argv, '--dir', argv.find((arg) => !arg.startsWith('--')) || 'src');
const output = readOption(argv, '--output', 'rhythmguard-figma-export.json');
const includeMotion = argv.includes('--include-motion');

const report = await createAuditReport({ dir, includeMotion });
const contract = toAuditContractReport(report);
const outputPath = path.resolve(process.cwd(), output);

fs.writeFileSync(outputPath, `${JSON.stringify(buildFigmaPayload(contract), null, 2)}\n`);
process.stdout.write(`Wrote ${outputPath}\n`);
