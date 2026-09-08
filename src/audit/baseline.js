'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatPath } = require('./shared');

/**
 * Baseline keys name a finding by what it is, not where it sits: rule, type,
 * file, property (or Tailwind class), value, and the occurrence index among
 * identical findings in that file. Inserting a comment above a declaration no
 * longer turns it into one "resolved" and one "new"; adding a second identical
 * off-scale declaration still counts as new. Version 1 baselines keyed by line
 * and column are still compared with the key they were written with.
 */
const BASELINE_FORMAT_VERSION = 2;

function applyBaselineComparison(report, baselinePath) {
  const resolvedPath = path.resolve(process.cwd(), baselinePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const baseline = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const baselineFindings = Array.isArray(baseline.findings) ? baseline.findings : [];
  const legacy = baseline.formatVersion !== BASELINE_FORMAT_VERSION;
  const currentFindings = getAllFindings(report);
  const currentKeys = legacy
    ? new Map(currentFindings.map((finding) => [finding, createLegacyFindingKey(finding)]))
    : assignFindingKeys(currentFindings);
  const baselineKeys = new Set(baselineFindings.map((finding) => finding.key || createLegacyFindingKey(finding)));
  const currentKeySet = new Set(currentKeys.values());
  const newFindings = currentFindings.filter((finding) => !baselineKeys.has(currentKeys.get(finding)));
  const resolvedFindings = baselineFindings.filter((finding) => !currentKeySet.has(finding.key || createLegacyFindingKey(finding)));

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
  const findings = getAllFindings(report);
  const keys = assignFindingKeys(findings);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(
    resolvedPath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      directory: report.directory,
      findings: findings.map((finding) => toBaselineFinding(finding, keys.get(finding))),
      formatVersion: BASELINE_FORMAT_VERSION,
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

function toBaselineFinding(finding, key) {
  return {
    column: finding.column,
    file: finding.file,
    key,
    line: finding.line,
    property: finding.property || undefined,
    rule: finding.rule,
    text: finding.text,
    token: finding.token,
    type: finding.type,
    value: finding.value || finding.rawValue,
  };
}

function findingIdentity(finding) {
  return [
    finding.rule || '',
    finding.type || '',
    finding.file || '',
    finding.property || finding.token || '',
    finding.value || finding.rawValue || '',
  ].join('\u001f');
}

/** Content keys for a set of findings: identity plus the occurrence index in source order. */
function assignFindingKeys(findings) {
  const ordered = [...findings].sort((a, b) =>
    String(a.file).localeCompare(String(b.file)) || (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0));
  const seen = new Map();
  const keys = new Map();
  for (const finding of ordered) {
    const identity = findingIdentity(finding);
    const occurrence = seen.get(identity) || 0;
    seen.set(identity, occurrence + 1);
    keys.set(finding, `${identity}\u001f${occurrence}`);
  }
  return keys;
}

/** The version 1 key: position-based, kept so existing baseline files keep working. */
function createLegacyFindingKey(finding) {
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
  BASELINE_FORMAT_VERSION,
  applyBaselineComparison,
  assignFindingKeys,
  createLegacyFindingKey,
  getAllFindings,
  getAuditFailures,
  writeBaseline,
};
