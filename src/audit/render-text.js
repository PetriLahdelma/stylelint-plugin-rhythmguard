'use strict';

const {
  sortCountMap,
  sumCounts,
} = require('./contract');
const { auditCommand, shellQuote } = require('./next-steps');
const {
  histBar,
  newFindingsPhrase,
  scoreBar,
  truncate,
} = require('./render-utils');

/**
 * `options.auditCommand` is the command that reproduces this run (its directory
 * and scale flags); the footer builds on it so the next step uses the same scale.
 */
function renderText(report, options = {}) {
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
    ...(report.scanned && report.scanned.stylelintMissing > 0 ? [`  Stylesheets not audited  ${String(report.scanned.stylelintMissing).padStart(4)}  (Stylelint is not installed: npm install --save-dev stylelint)`] : []),
    ...(report.scanned && report.scanned.stylelintIgnored > 0 ? [`  Ignored by .stylelintignore ${String(report.scanned.stylelintIgnored).padStart(4)}  (not audited)`] : []),
    ...(report.scanned && report.scanned.nonAuthoredSkipped > 0 ? [`  Non-authored skipped     ${String(report.scanned.nonAuthoredSkipped).padStart(4)}  (vendored, minified or built CSS; --include-non-authored audits them)`] : []),
    ...(report.scanned && report.scanned.linksOutsideRoot > 0 ? [`  Links not followed       ${String(report.scanned.linksOutsideRoot).padStart(4)}  (they point outside the scanned directory)`] : []),
    ...(parseErrors(report).length > 0 ? [`  Parse errors             ${String(parseErrors(report).length).padStart(4)}  (not audited)`] : []),
    `  Files with issues        ${String(report.filesWithIssues).padStart(4)}`,
    `  Scale cleanliness        ${scoreBar(report.scaleCleanliness)}  ${report.scaleCleanliness}%`,
  ];

  if (report.scale) {
    lines.push(`  Scale                    ${report.scale.values.join(', ')}`);
    const files = report.scale.files.length > 0 ? ` (${report.scale.files.join(', ')})` : '';
    const rejected = report.scale.rejected ? ` (${report.scale.rejected.source} rejected: ${report.scale.rejected.reasons.join(', ')})` : '';
    lines.push(`  Scale source             ${report.scale.source}${files}${rejected}`);
    if (report.scale.classStrings) {
      lines.push(`  Class-string scale       ${report.scale.classStrings.name} (${report.scale.classStrings.values.join(', ')})`);
    }
  }
  if (report.decisions) {
    lines.push(`  Decisions                ${report.decisions.adopt + report.decisions.allow + report.decisions.snap + report.decisions.undecided} (${report.decisions.adopt} adopt, ${report.decisions.allow} allow, ${report.decisions.snap} snap, ${report.decisions.undecided} undecided); ${report.decisions.suppressed} findings suppressed`);
  }
  if (report.baseline) {
    lines.push(`  Since baseline           ${report.baseline.resolvedFindingsCount} resolved, ${newFindingsPhrase(report.baseline)}`);
  }
  lines.push('');

  appendHistogram(lines, 'CSS OFF-SCALE VALUES', report.offScaleValues);
  appendHistogram(lines, 'CSS OFF-SCALE PROPERTIES', report.offScaleProperties);
  appendHistogram(lines, 'CSS TOKEN OPPORTUNITIES', report.tokenOpportunities);
  appendHistogram(lines, 'TAILWIND CLASS-STRING DRIFT', report.tailwindArbitraryValues);
  appendHistogram(lines, 'MOTION RHYTHM DRIFT', report.motion.values);
  appendFindingList(lines, 'MISSING TOKENS IN USE', report.findings.css.filter((finding) => finding.type === 'missing-token'));
  appendFindingList(lines, 'UNCLASSIFIED WARNINGS', report.findings.css.filter((finding) => finding.type === 'unclassified'));
  appendTokenContractText(lines, report.tokenContract);
  if (report.tokenContract.chains && report.tokenContract.chains.summary.total > 0) {
    const { summary } = report.tokenContract.chains;
    lines.push(`  Token chains             ${summary['on-scale']} of ${summary.total} resolve to the scale (${summary['off-scale']} off-scale, ${summary.unresolved} unresolved, ${summary.ambiguous} ambiguous)`);
    lines.push('');
  }
  if (report.tokenContract.ladders && report.tokenContract.ladders.summary.ladders > 0) {
    const { summary } = report.tokenContract.ladders;
    lines.push(`  Token ladders            ${summary.ladders} checked (${summary.collapsed} collapsed, ${summary.tooClose} under ${summary.minStepPx}px apart, ${summary.inverted} inverted steps)`);
    lines.push('');
  }
  appendBaselineText(lines, report);
  appendParseErrorsText(lines, report);

  if (report.topAffectedFiles.length > 0) {
    lines.push('  ── TOP AFFECTED FILES ──');
    lines.push('');
    const maxCount = Math.max(...report.topAffectedFiles.map(({ count }) => count));
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`  ${truncate(file, 34).padEnd(36)} ${histBar(count, maxCount)} ${count}`);
    }
    lines.push('');
  }

  if (nothingAudited(report)) {
    lines.push(`  ! Nothing was audited: ${nothingAuditedReasons(report).join('; ')}. The cleanliness above counts no files.`);
  } else if (report.totalWarnings === 0 && parseErrors(report).length > 0) {
    lines.push(`  ! No findings in the stylesheets that parsed; ${parseErrors(report).length} could not be parsed and were not audited.`);
  } else if (report.totalWarnings === 0) {
    lines.push('  ✓ No issues found. Your design-system rhythm is clean.');
  } else {
    // Snapping a value can move layout, so the footer offers the reviewable
    // path: one decision per value, then a rewrite of each decided value.
    const command = options.auditCommand || auditCommand({ dir: report.directory });
    lines.push(`  → Propose one decision per off-scale value: ${command} --plan`);
    lines.push(`  → Then rewrite each value you decided on: npx rhythmguard fix ${shellQuote(report.directory)} --value <px> --to <step or token>`);
    lines.push(`  → PR or design review: ${command} --format markdown`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

/** No stylesheet and no template file was read, though the run may have found some (dx-09). */
function nothingAudited(report) {
  return (report.cssFilesScanned || 0) === 0 && (report.templateFilesScanned || 0) === 0;
}

function nothingAuditedReasons(report) {
  const scanned = report.scanned || {};
  const reasons = [
    ...(scanned.stylelintMissing > 0 ? [`${scanned.stylelintMissing} stylesheets need Stylelint, which is not installed`] : []),
    ...(scanned.scssSkipped > 0 ? [`${scanned.scssSkipped} SCSS files need postcss-scss, which is not installed`] : []),
    ...(scanned.stylelintIgnored > 0 ? [`${scanned.stylelintIgnored} stylesheets are in .stylelintignore`] : []),
    ...(scanned.nonAuthoredSkipped > 0 ? [`${scanned.nonAuthoredSkipped} stylesheets look vendored, minified or built`] : []),
    ...(parseErrors(report).length > 0 ? [`${parseErrors(report).length} stylesheets could not be parsed`] : []),
  ];
  return reasons.length > 0 ? reasons : [`no .css, .scss or template files under ${report.directory}`];
}

function parseErrors(report) {
  return (report.findings && report.findings.parseErrors) || [];
}

function appendParseErrorsText(lines, report) {
  const errors = parseErrors(report);
  if (errors.length === 0) {
    return;
  }
  lines.push(`  ── PARSE ERRORS ──  ${errors.length} not audited`);
  lines.push('');
  for (const finding of errors) {
    lines.push(`  ${finding.file}:${finding.line}:${finding.column}  ${finding.text}`);
  }
  lines.push('');
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
      for (const warning of source.warnings) {
        lines.push(`      ! ${warning}`);
      }
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
    if (report.baseline.newTokenDebtCount > 0) {
      lines.push(`    of which token debt  ${String(report.baseline.newTokenDebtCount).padStart(4)}  (not drift; --fail-on-new-token-debt gates it)`);
    }
    lines.push(`  Resolved findings      ${String(report.baseline.resolvedFindingsCount).padStart(4)}`);
    lines.push('');
  }

  if (report.baselineWritten) {
    lines.push(`  Baseline written       ${report.baselineWritten.file}`);
    lines.push('');
  }
}

/**
 * Findings that have no value to count by: missing-token uses (with
 * --report-missing-tokens) and Stylelint warnings the audit could not read
 * (cq-02). Ten lines, then a count.
 */
function appendFindingList(lines, title, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push(`  ── ${title} ──  ${findings.length} total`);
  lines.push('');
  for (const finding of findings.slice(0, 10)) {
    lines.push(`  ${finding.file}:${finding.line}:${finding.column}  ${finding.text}`);
  }
  if (findings.length > 10) {
    lines.push(`  ${findings.length - 10} more in --format json`);
  }
  lines.push('');
}

function appendHistogram(lines, title, counts = {}) {
  const entries = sortCountMap(counts || {});
  const total = sumCounts(counts || {});

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
  nothingAudited,
  nothingAuditedReasons,
  appendBaselineText,
  appendHistogram,
  appendParseErrorsText,
  appendTokenContractText,
  renderText,
};
