'use strict';

const { getAllFindings, isTokenDebtFinding } = require('./baseline');
const { newFindingsPhrase } = require('./render-utils');

/**
 * GitHub shows at most 10 error and 10 warning annotations per step and drops
 * the rest without a word, so the one line a pull request added was annotation
 * 4,695 of 5,987 (ci-03). The summary comes first; with a baseline only the
 * new findings are annotated, drift as errors and token debt as warnings;
 * each type stops at the cap with a notice that says how many were left out.
 * Arrays are walked, not spread:
 * spreading 150,000 findings into push() overflowed the stack (cq-04).
 */
const ANNOTATIONS_PER_TYPE = 10;

function annotation(level, finding, text) {
  return `::${level} file=${escapeGithubProperty(finding.file)},line=${finding.line || 1},col=${finding.column || 1},title=${escapeGithubProperty(finding.rule || 'rhythmguard')}::${escapeGithubData(text)}`;
}

function renderGithub(report) {
  const findings = getAllFindings(report);
  const parseErrors = (report.findings && report.findings.parseErrors) || [];
  const baseline = report.baseline || null;
  const findingWord = findings.length === 1 ? 'finding' : 'findings';
  const fileWord = report.filesWithIssues === 1 ? 'file' : 'files';
  const lines = [
    `::notice title=Rhythmguard audit::${escapeGithubData([
      ...(baseline ? [`Since baseline: ${baseline.resolvedFindingsCount} resolved, ${newFindingsPhrase(baseline)}.`] : []),
      `${findings.length} ${findingWord} across ${report.filesWithIssues} ${fileWord}, ${report.scaleCleanliness}% scale cleanliness`,
    ].join(' '))}`,
  ];

  // Errors: stylesheets that could not be parsed, then (with a baseline) new findings.
  const errors = [];
  for (const finding of parseErrors) {
    errors.push(annotation('error', { ...finding, rule: finding.rule || 'CssSyntaxError' }, `Not audited: ${finding.text || ''}`));
  }
  // New drift is an error. New token debt is a warning: it is not drift and
  // fails no gate unless --fail-on-new-token-debt is set (dx-08).
  const errorLines = [...errors];
  const warningLines = [];
  for (const finding of baseline ? baseline.newFindings || [] : findings) {
    if (baseline && !isTokenDebtFinding(finding)) {
      errorLines.push(annotation('error', finding, `New since the baseline: ${finding.text || ''}`));
    } else {
      warningLines.push(annotation('warning', finding, `${baseline ? 'New since the baseline: ' : ''}${finding.text || ''}`));
    }
  }

  for (const group of [errorLines, warningLines]) {
    for (const line of group.slice(0, ANNOTATIONS_PER_TYPE)) {
      lines.push(line);
    }
  }
  const left = Math.max(0, errorLines.length - ANNOTATIONS_PER_TYPE) + Math.max(0, warningLines.length - ANNOTATIONS_PER_TYPE);
  if (left > 0) {
    lines.push(`::notice title=Rhythmguard audit::${escapeGithubData(`${left} more not annotated: GitHub shows ${ANNOTATIONS_PER_TYPE} per type. The full list is in --format markdown or --format json.`)}`);
  }
  return `${lines.join('\n')}\n`;
}

// Escaping rules from GitHub's actions/toolkit (packages/core/src/command.ts).

function escapeGithubData(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function escapeGithubProperty(value) {
  return escapeGithubData(value)
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

module.exports = {
  ANNOTATIONS_PER_TYPE,
  escapeGithubData,
  escapeGithubProperty,
  renderGithub,
};
