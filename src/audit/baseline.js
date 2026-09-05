'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatPath } = require('./shared');

function applyBaselineComparison(report, baselinePath) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const baseline = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const baselineFindings = Array.isArray(baseline.findings) ? baseline.findings : [];
  const baselineKeys = new Set(baselineFindings.map((finding) => finding.key || createFindingKey(finding)));
  const currentFindings = getAllFindings(report);
  const currentKeys = new Set(currentFindings.map(createFindingKey));
  const newFindings = currentFindings.filter((finding) => !baselineKeys.has(createFindingKey(finding)));
  const resolvedFindings = baselineFindings.filter((finding) => !currentKeys.has(finding.key || createFindingKey(finding)));

  report.baseline = {
    baselineFindings: baselineFindings.length,
    file: formatPath(resolvedPath),
    newFindings,
    newFindingsCount: newFindings.length,
    resolvedFindingsCount: resolvedFindings.length,
  };
  report.summary.newFindings = newFindings.length;
  report.summary.resolvedFindings = resolvedFindings.length;
}

function writeBaseline(report, baselinePath) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(
    resolvedPath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      directory: report.directory,
      findings: getAllFindings(report).map(toBaselineFinding),
      formatVersion: 1,
      summary: {
        scaleCleanliness: report.scaleCleanliness,
        totalFindings: report.totalWarnings,
      },
    }, null, 2)}\n`,
  );

  report.baselineWritten = {
    file: formatPath(resolvedPath),
    findings: report.totalWarnings,
  };
}

function getAllFindings(report) {
  return [
    ...report.findings.css,
    ...report.findings.motion,
    ...report.findings.tailwind,
  ];
}

function toBaselineFinding(finding) {
  return {
    column: finding.column,
    file: finding.file,
    key: createFindingKey(finding),
    line: finding.line,
    rule: finding.rule,
    text: finding.text,
    token: finding.token,
    type: finding.type,
    value: finding.value || finding.rawValue,
  };
}

function createFindingKey(finding) {
  return [
    finding.rule || '',
    finding.type || '',
    finding.file || '',
    finding.line || '',
    finding.column || '',
    finding.value || finding.rawValue || finding.token || '',
    finding.text || '',
  ].join('\u001f');
}

function getAuditFailures(report, parsed) {
  const failures = [];

  if (parsed.maxFindings !== null && report.totalWarnings > parsed.maxFindings) {
    failures.push(`total findings ${report.totalWarnings} exceeds --max-findings ${parsed.maxFindings}`);
  }

  if (parsed.minCleanliness !== null && report.scaleCleanliness < parsed.minCleanliness) {
    failures.push(`scale cleanliness ${report.scaleCleanliness}% is below --min-cleanliness ${parsed.minCleanliness}%`);
  }

  if (parsed.failOnNewDrift && report.baseline && report.baseline.newFindingsCount > 0) {
    failures.push(`new drift found: ${report.baseline.newFindingsCount} finding(s) not present in baseline`);
  }

  return failures;
}

module.exports = {
  applyBaselineComparison,
  createFindingKey,
  getAllFindings,
  getAuditFailures,
  toBaselineFinding,
  writeBaseline,
};
