'use strict';

const { sortCountMap } = require('./contract');
const { escapeMarkdown } = require('./render-utils');

function renderMarkdown(report) {
  const lines = [
    '# Rhythmguard Design-System Audit',
    '',
    `Directory: \`${report.directory}\``,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| CSS files scanned | ${report.cssFilesScanned} |`,
    `| Template files scanned | ${report.templateFilesScanned} |`,
    `| Files with issues | ${report.filesWithIssues} |`,
    `| Total findings | ${report.totalWarnings} |`,
    `| Scale cleanliness | ${report.scaleCleanliness}% |`,
  ];

  if (report.baseline) {
    lines.push(`| New findings | ${report.baseline.newFindingsCount} |`);
    lines.push(`| Resolved findings | ${report.baseline.resolvedFindingsCount} |`);
  }
  lines.push('');

  appendMarkdownCounts(lines, 'CSS Off-Scale Values', report.offScaleValues);
  appendMarkdownCounts(lines, 'CSS Token Opportunities', report.tokenOpportunities);
  appendMarkdownCounts(lines, 'Tailwind Class-String Drift', report.tailwindArbitraryValues);
  appendMarkdownCounts(lines, 'Motion Rhythm Drift', report.motion.values);
  appendTokenContractMarkdown(lines, report.tokenContract);
  appendBaselineMarkdown(lines, report);

  if (report.topAffectedFiles.length > 0) {
    lines.push('## Top Affected Files');
    lines.push('');
    lines.push('| File | Findings |');
    lines.push('| --- | ---: |');
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`| \`${escapeMarkdown(file)}\` | ${count} |`);
    }
    lines.push('');
  }

  if (report.findings.tailwind.length > 0) {
    lines.push('## Tailwind Examples');
    lines.push('');
    lines.push('| File | Class | Suggested class |');
    lines.push('| --- | --- | --- |');
    for (const finding of report.findings.tailwind.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(`${finding.file}:${finding.line}`)}\` | \`${escapeMarkdown(finding.token)}\` | \`${escapeMarkdown(finding.fixedToken || 'n/a')}\` |`);
    }
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  lines.push('');
  if (report.totalWarnings === 0) {
    lines.push('- Keep Rhythmguard in CI to prevent new drift.');
  } else {
    lines.push('- Run deterministic autofix for CSS declarations where appropriate.');
    lines.push('- Review Tailwind arbitrary spacing values with UX/design-system owners.');
    lines.push('- Convert repeated raw on-scale values into existing design tokens.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function appendTokenContractMarkdown(lines, tokenContract) {
  const {
    conflictingTokens,
    missingTokens,
    rawValueCandidates,
    rawValueMatches,
    sources,
    unusedTokens,
  } = tokenContract;
  if (
    missingTokens.length === 0 &&
    rawValueCandidates.length === 0 &&
    rawValueMatches.length === 0 &&
    unusedTokens.length === 0 &&
    conflictingTokens.length === 0 &&
    sources.length === 0
  ) {
    return;
  }

  lines.push('## Token Contract');
  lines.push('');

  if (sources.length > 0) {
    lines.push('### Token Sources');
    lines.push('');
    lines.push('| File | Format | Tokens | Warnings |');
    lines.push('| --- | --- | ---: | --- |');
    for (const source of sources.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(source.file)}\` | \`${source.format}\` | ${source.tokenCount} | \`${escapeMarkdown(source.warnings.join('; ') || 'none')}\` |`);
    }
    lines.push('');
  }

  if (missingTokens.length > 0) {
    lines.push('### Tokens Used But Missing');
    lines.push('');
    lines.push('| Token | Files |');
    lines.push('| --- | --- |');
    for (const entry of missingTokens.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.token)}\` | \`${escapeMarkdown(entry.files.join(', '))}\` |`);
    }
    lines.push('');
  }

  if (unusedTokens.length > 0) {
    lines.push('### Tokens Defined But Unused');
    lines.push('');
    lines.push('| Token | Value |');
    lines.push('| --- | --- |');
    for (const entry of unusedTokens.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.token)}\` | \`${escapeMarkdown((entry.values || []).join(', ') || 'n/a')}\` |`);
    }
    lines.push('');
  }

  if (rawValueCandidates.length > 0) {
    lines.push('### Repeated Raw Value Candidates');
    lines.push('');
    lines.push('| Value | Count | Files |');
    lines.push('| --- | ---: | --- |');
    for (const entry of rawValueCandidates.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.value)}\` | ${entry.count} | \`${escapeMarkdown(entry.files.join(', '))}\` |`);
    }
    lines.push('');
  }

  if (rawValueMatches.length > 0) {
    lines.push('### Raw Values Matching Known Tokens');
    lines.push('');
    lines.push('| Value | Count | Tokens |');
    lines.push('| --- | ---: | --- |');
    for (const entry of rawValueMatches.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.value)}\` | ${entry.count} | \`${escapeMarkdown(entry.tokens.join(', '))}\` |`);
    }
    lines.push('');
  }

  if (conflictingTokens.length > 0) {
    lines.push('### Conflicting Token Values');
    lines.push('');
    lines.push('| Value | Tokens |');
    lines.push('| --- | --- |');
    for (const entry of conflictingTokens.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(entry.value)}\` | \`${escapeMarkdown(entry.tokens.join(', '))}\` |`);
    }
    lines.push('');
  }
}

function appendBaselineMarkdown(lines, report) {
  if (!report.baseline && !report.baselineWritten) {
    return;
  }

  lines.push('## Baseline');
  lines.push('');

  if (report.baseline) {
    lines.push('| Metric | Value |');
    lines.push('| --- | ---: |');
    lines.push(`| Baseline findings | ${report.baseline.baselineFindings} |`);
    lines.push(`| New findings | ${report.baseline.newFindingsCount} |`);
    lines.push(`| Resolved findings | ${report.baseline.resolvedFindingsCount} |`);
    lines.push('');
  }

  if (report.baseline && report.baseline.newFindings.length > 0) {
    lines.push('| New finding | Location |');
    lines.push('| --- | --- |');
    for (const finding of report.baseline.newFindings.slice(0, 10)) {
      lines.push(`| \`${escapeMarkdown(finding.text)}\` | \`${escapeMarkdown(`${finding.file}:${finding.line}`)}\` |`);
    }
    lines.push('');
  }

  if (report.baselineWritten) {
    lines.push(`Baseline written: \`${escapeMarkdown(report.baselineWritten.file)}\``);
    lines.push('');
  }
}

function appendMarkdownCounts(lines, title, counts) {
  const entries = sortCountMap(counts);

  if (entries.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| Value | Count |');
  lines.push('| --- | ---: |');
  for (const [value, count] of entries) {
    lines.push(`| \`${escapeMarkdown(value)}\` | ${count} |`);
  }
  lines.push('');
}

module.exports = {
  appendBaselineMarkdown,
  appendMarkdownCounts,
  appendTokenContractMarkdown,
  renderMarkdown,
};
