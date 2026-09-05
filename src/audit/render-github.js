'use strict';

const { getAllFindings } = require('./baseline');

function renderGithub(report) {
  const findings = getAllFindings(report);
  const lines = findings.map((finding) =>
    `::warning file=${escapeGithubProperty(finding.file)},line=${finding.line || 1},col=${finding.column || 1},title=${escapeGithubProperty(finding.rule || 'rhythmguard')}::${escapeGithubData(finding.text || '')}`,
  );
  const findingWord = findings.length === 1 ? 'finding' : 'findings';
  const fileWord = report.filesWithIssues === 1 ? 'file' : 'files';
  lines.push(
    `::notice title=Rhythmguard audit::${escapeGithubData(
      `${findings.length} ${findingWord} across ${report.filesWithIssues} ${fileWord}, ${report.scaleCleanliness}% scale cleanliness`,
    )}`,
  );
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
  escapeGithubData,
  escapeGithubProperty,
  renderGithub,
};
