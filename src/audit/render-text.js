'use strict';

const {
  sortCountMap,
  sumCounts,
} = require('./contract');
const {
  histBar,
  scoreBar,
  truncate,
} = require('./render-utils');

function renderText(report) {
  const lines = [
    '',
    '  ┌─ RHYTHMGUARD DESIGN-SYSTEM AUDIT ─────────────────────────┐',
    `  │  ${report.directory.padEnd(58)}│`,
    '  └─────────────────────────────────────────────────────────────┘',
    '',
    `  CSS files scanned        ${String(report.cssFilesScanned).padStart(4)}`,
    `  Template files scanned   ${String(report.templateFilesScanned).padStart(4)}`,
    ...(report.scanned && report.scanned.scssFiles > 0 ? [`  SCSS files scanned       ${String(report.scanned.scssFiles - report.scanned.scssSkipped).padStart(4)}`] : []),
    ...(report.scanned && report.scanned.scssSkipped > 0 ? [`  SCSS files skipped       ${String(report.scanned.scssSkipped).padStart(4)}  (install postcss-scss to audit them)`] : []),
    `  Files with issues        ${String(report.filesWithIssues).padStart(4)}`,
    `  Scale cleanliness        ${scoreBar(report.scaleCleanliness)}  ${report.scaleCleanliness}%`,
  ];

  if (report.scale) {
    lines.push(`  Scale                    ${report.scale.values.join(', ')}`);
    const files = report.scale.files.length > 0 ? ` (${report.scale.files.join(', ')})` : '';
    lines.push(`  Scale source             ${report.scale.source}${files}`);
  }
  lines.push('');

  appendHistogram(lines, 'CSS OFF-SCALE VALUES', report.offScaleValues);
  appendHistogram(lines, 'CSS TOKEN OPPORTUNITIES', report.tokenOpportunities);
  appendHistogram(lines, 'TAILWIND CLASS-STRING DRIFT', report.tailwindArbitraryValues);
  appendHistogram(lines, 'MOTION RHYTHM DRIFT', report.motion.values);
  appendTokenContractText(lines, report.tokenContract);
  appendBaselineText(lines, report);

  if (report.topAffectedFiles.length > 0) {
    lines.push('  ── TOP AFFECTED FILES ──');
    lines.push('');
    const maxCount = Math.max(...report.topAffectedFiles.map(({ count }) => count));
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`  ${truncate(file, 34).padEnd(36)} ${histBar(count, maxCount)} ${count}`);
    }
    lines.push('');
  }

  if (report.totalWarnings === 0) {
    lines.push('  ✓ No issues found. Your design-system rhythm is clean.');
  } else {
    lines.push('  → Run "npx stylelint --fix" for CSS declaration fixes.');
    lines.push('  → Use "npx rhythmguard audit ./src --format markdown" for PR/design review.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function appendTokenContractText(lines, tokenContract) {
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

  lines.push('  ── TOKEN CONTRACT ──');
  lines.push('');

  if (sources.length > 0) {
    lines.push(`  Token sources         ${sources.length}`);
    for (const source of sources.slice(0, 5)) {
      const warningSuffix = source.warnings.length > 0 ? ' (warning)' : '';
      lines.push(`    ${truncate(source.file, 42)} ${source.tokenCount}${warningSuffix}`);
    }
  }

  if (missingTokens.length > 0) {
    lines.push(`  Missing tokens         ${missingTokens.length}`);
    for (const entry of missingTokens.slice(0, 5)) {
      lines.push(`    ${entry.token} (${truncate(entry.files.join(', '), 42)})`);
    }
  }

  if (unusedTokens.length > 0) {
    lines.push(`  Defined but unused     ${unusedTokens.length}`);
    for (const entry of unusedTokens.slice(0, 5)) {
      lines.push(`    ${entry.token}`);
    }
  }

  if (rawValueCandidates.length > 0) {
    lines.push(`  Repeated raw values    ${rawValueCandidates.length}`);
    for (const entry of rawValueCandidates.slice(0, 5)) {
      lines.push(`    ${entry.value.padEnd(14)} ${entry.count}`);
    }
  }

  if (rawValueMatches.length > 0) {
    lines.push(`  Raw values matching tokens ${rawValueMatches.length}`);
    for (const entry of rawValueMatches.slice(0, 5)) {
      lines.push(`    ${entry.value.padEnd(14)} ${truncate(entry.tokens.join(', '), 34)}`);
    }
  }

  if (conflictingTokens.length > 0) {
    lines.push(`  Conflicting tokens     ${conflictingTokens.length}`);
    for (const entry of conflictingTokens.slice(0, 5)) {
      lines.push(`    ${entry.value.padEnd(14)} ${truncate(entry.tokens.join(', '), 34)}`);
    }
  }

  lines.push('');
}

function appendBaselineText(lines, report) {
  if (report.baseline) {
    lines.push('  ── BASELINE COMPARISON ──');
    lines.push('');
    lines.push(`  Baseline findings      ${String(report.baseline.baselineFindings).padStart(4)}`);
    lines.push(`  New findings           ${String(report.baseline.newFindingsCount).padStart(4)}`);
    lines.push(`  Resolved findings      ${String(report.baseline.resolvedFindingsCount).padStart(4)}`);
    lines.push('');
  }

  if (report.baselineWritten) {
    lines.push(`  Baseline written       ${report.baselineWritten.file}`);
    lines.push('');
  }
}

function appendHistogram(lines, title, counts) {
  const entries = sortCountMap(counts);
  const total = sumCounts(counts);

  if (entries.length === 0) {
    return;
  }

  lines.push(`  ── ${title} ──  ${total} total`);
  lines.push('');
  const maxCount = Math.max(...entries.map(([, count]) => count));
  for (const [value, count] of entries) {
    lines.push(`  ${value.padEnd(14)} ${histBar(count, maxCount)} ${count}`);
  }
  lines.push('');
}

module.exports = {
  appendBaselineText,
  appendHistogram,
  appendTokenContractText,
  renderText,
};
