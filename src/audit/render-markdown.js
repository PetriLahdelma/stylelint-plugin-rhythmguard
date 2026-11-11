'use strict';

const { sortCountMap } = require('./contract');
const { auditCommand } = require('./next-steps');
const { nothingAudited, nothingAuditedReasons } = require('./render-text');
const { escapeMarkdown, markdownCode, tableCode } = require('./render-utils');

function describeScaleSource(scale) {
  if (scale.rejected) {
    return `${scale.source} (${scale.rejected.source} rejected: ${scale.rejected.reasons.join(', ')})`;
  }
  return scale.files.length > 0
    ? `${scale.source} (${scale.files.join(', ')})`
    : scale.source;
}

/**
 * The report a pull request comment carries. GitHub rejects a comment over
 * 65,536 characters, and on 300 stylesheets this reached 64,473 with the new
 * finding at line 129 (ci-03): new findings now come first, and file lists are
 * cut to five names.
 */
function renderMarkdown(report, options = {}) {
  const lines = [
    '# Rhythmguard Design-System Audit',
    '',
    ...(report.baseline ? [`**Since baseline:** ${report.baseline.resolvedFindingsCount} resolved, ${report.baseline.newFindingsCount} new.`, ''] : []),
    `Directory: ${markdownCode(report.directory)}`,
    '',
  ];
  if (nothingAudited(report)) {
    lines.push(`**Nothing was audited:** ${escapeMarkdown(nothingAuditedReasons(report).join('; '))}.`, '');
  }
  appendNewFindingsMarkdown(lines, report);
  lines.push(
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| CSS files scanned | ${report.cssFilesScanned} |`,
    `| Template files scanned | ${report.templateFilesScanned} |`,
    ...(report.scanned && report.scanned.scssFiles > 0 ? [`| SCSS files scanned | ${report.scanned.scssFiles - report.scanned.scssSkipped} |`] : []),
    ...(report.scanned && report.scanned.scssSkipped > 0 ? [`| SCSS files skipped (install postcss-scss) | ${report.scanned.scssSkipped} |`] : []),
    ...(report.scanned && report.scanned.stylelintMissing > 0 ? [`| Stylesheets not audited (Stylelint is not installed: \`npm install --save-dev stylelint\`) | ${report.scanned.stylelintMissing} |`] : []),
    ...(report.scanned && report.scanned.stylelintIgnored > 0 ? [`| Stylesheets ignored by .stylelintignore (not audited) | ${report.scanned.stylelintIgnored} |`] : []),
    ...(report.scanned && report.scanned.nonAuthoredSkipped > 0 ? [`| Non-authored stylesheets skipped (vendored, minified or built; --include-non-authored audits them) | ${report.scanned.nonAuthoredSkipped} |`] : []),
    ...(report.scanned && report.scanned.linksOutsideRoot > 0 ? [`| Symbolic links not followed (they point outside the scanned directory) | ${report.scanned.linksOutsideRoot} |`] : []),
    ...(parseErrors(report).length > 0 ? [`| Stylesheets that failed to parse (not audited) | ${parseErrors(report).length} |`] : []),
    `| Files with issues | ${report.filesWithIssues} |`,
    `| Total findings | ${report.totalWarnings} |`,
    `| Scale cleanliness | ${report.scaleCleanliness}% |`,
  );

  if (report.scale) {
    lines.push(`| Scale | ${report.scale.values.join(', ')} |`);
    lines.push(`| Scale source | ${escapeMarkdown(describeScaleSource(report.scale))} |`);
    if (report.scale.classStrings) {
      lines.push(`| Class-string scale | ${escapeMarkdown(report.scale.classStrings.name)} |`);
    }
  }

  if (report.decisions) {
    lines.push(`| Decisions | ${report.decisions.adopt + report.decisions.allow + report.decisions.snap + report.decisions.undecided} (${report.decisions.adopt} adopt, ${report.decisions.allow} allow, ${report.decisions.snap} snap, ${report.decisions.undecided} undecided); ${report.decisions.suppressed} findings suppressed |`);
  }

  if (report.baseline) {
    lines.push(`| New findings | ${report.baseline.newFindingsCount} |`);
    lines.push(`| Resolved findings | ${report.baseline.resolvedFindingsCount} |`);
  }
  lines.push('');

  appendMarkdownCounts(lines, 'CSS Off-Scale Values', report.offScaleValues);
  appendMarkdownCounts(lines, 'CSS Off-Scale Properties', report.offScaleProperties, 'Property');
  appendMarkdownCounts(lines, 'CSS Token Opportunities', report.tokenOpportunities);
  appendMarkdownCounts(lines, 'Tailwind Class-String Drift', report.tailwindArbitraryValues);
  appendMarkdownCounts(lines, 'Motion Rhythm Drift', report.motion.values);
  appendTokenContractMarkdown(lines, report.tokenContract);
  appendTokenChainsMarkdown(lines, report.tokenContract.chains);
  appendTokenLaddersMarkdown(lines, report.tokenContract.ladders);
  appendBaselineMarkdown(lines, report);
  appendParseErrorsMarkdown(lines, report);

  if (report.topAffectedFiles.length > 0) {
    lines.push('## Top Affected Files');
    lines.push('');
    lines.push('| File | Findings |');
    lines.push('| --- | ---: |');
    for (const { file, count } of report.topAffectedFiles) {
      lines.push(`| ${tableCode(file)} | ${count} |`);
    }
    lines.push('');
  }

  if (report.findings.tailwind.length > 0) {
    lines.push('## Tailwind Examples');
    lines.push('');
    lines.push('| File | Class | Suggested class |');
    lines.push('| --- | --- | --- |');
    for (const finding of report.findings.tailwind.slice(0, 10)) {
      lines.push(`| ${tableCode(`${finding.file}:${finding.line}`)} | ${tableCode(finding.token)} | ${tableCode(finding.fixedToken || 'n/a')} |`);
    }
    lines.push('');
  }

  lines.push('## Recommended Next Actions');
  lines.push('');
  if (parseErrors(report).length > 0) {
    lines.push('- Fix the parse errors above: those stylesheets were not audited.');
  }
  if (report.totalWarnings === 0) {
    lines.push('- Keep Rhythmguard in CI to prevent new drift.');
  } else {
    const command = options.auditCommand || auditCommand({ dir: report.directory });
    lines.push(`- Propose one decision per off-scale value with ${markdownCode(`${command} --plan`)}, then rewrite each decided value with ${markdownCode('npx rhythmguard fix <dir> --value <px> --to <step or token>')}. Snapping every value at once can move layout.`);
    lines.push('- Review Tailwind arbitrary spacing values with UX/design-system owners.');
    lines.push('- Convert repeated raw on-scale values into existing design tokens.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function parseErrors(report) {
  return (report.findings && report.findings.parseErrors) || [];
}

function appendParseErrorsMarkdown(lines, report) {
  const errors = parseErrors(report);
  if (errors.length === 0) {
    return;
  }
  lines.push('## Parse Errors');
  lines.push('');
  lines.push('These stylesheets could not be parsed, so they were not audited. They are not counted as findings or in scale cleanliness.');
  lines.push('');
  lines.push('| File | Error |');
  lines.push('| --- | --- |');
  for (const finding of errors) {
    lines.push(`| ${tableCode(`${finding.file}:${finding.line}:${finding.column}`)} | ${tableCode(finding.text || '')} |`);
  }
  lines.push('');
}

function appendTokenChainsMarkdown(lines, chains) {
  if (!chains || chains.summary.total === 0) {
    return;
  }
  const { summary } = chains;
  lines.push('## Token Chains');
  lines.push('');
  const attention = ['off-scale', 'unresolved', 'ambiguous', 'computed', 'non-length']
    .filter((outcome) => summary[outcome] > 0)
    .map((outcome) => `${summary[outcome]} ${outcome}`);
  lines.push(`${summary['on-scale']} of ${summary.total} spacing tokens resolve to the scale${attention.length > 0 ? `; ${attention.join(', ')}` : ''}. A token is followed through \`var()\` to its terminal value; the token layer, not the literal, is where a system like this keeps its discipline.`);
  lines.push('');
  if (chains.entries.length > 0) {
    lines.push('| Token | Outcome | Detail |');
    lines.push('| --- | --- | --- |');
    for (const entry of chains.entries.slice(0, 50)) {
      const detail = entry.reason
        ? entry.reason
        : entry.terminals.map((terminal) => tableCode(terminal)).join(', ');
      lines.push(`| ${tableCode(entry.token)} | ${entry.outcome} | ${detail}${entry.via.length > 0 ? ` via ${entry.via.map((name) => tableCode(name)).join(' → ')}` : ''} |`);
    }
    lines.push('');
  }
}

const LADDER_PROBLEM_TEXT = Object.freeze({
  collapsed: 'collapsed',
  inverted: 'inverted',
  'too-close': 'too close',
});

function appendTokenLaddersMarkdown(lines, ladders) {
  if (!ladders || ladders.entries.length === 0) {
    return;
  }
  const { summary } = ladders;
  lines.push('## Token Ladders');
  lines.push('');
  lines.push(`${ladders.entries.length} of ${summary.ladders} token ladders have steps that do not read as steps: ${summary.collapsed} collapsed, ${summary.tooClose} under ${summary.minStepPx}px apart, ${summary.inverted} inverted. Each step is shown at its smallest and largest value.`);
  lines.push('');
  for (const entry of ladders.entries.slice(0, 20)) {
    const flagged = new Map();
    for (const problem of entry.problems) {
      const where = problem.end === 'both' ? '' : ` at ${problem.end}`;
      const note = `${LADDER_PROBLEM_TEXT[problem.type]}${where} with ${tableCode(problem.tokens[0])}`;
      flagged.set(problem.tokens[1], [...(flagged.get(problem.tokens[1]) || []), note]);
    }
    const aliasNote = entry.aliases ? ` (also aliased as ${entry.aliases.map((alias) => markdownCode(alias)).join(', ')})` : '';
    lines.push(`**${markdownCode(entry.prefix)}**${aliasNote}`);
    lines.push('');
    lines.push('| Token | Min | Max | Problem |');
    lines.push('| --- | --- | --- | --- |');
    for (const step of entry.steps) {
      lines.push(`| ${tableCode(step.token)} | ${step.min || 'fluid'} | ${step.max || 'fluid'} | ${(flagged.get(step.token) || []).join('; ')} |`);
    }
    lines.push('');
  }
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
      lines.push(`| ${tableCode(source.file)} | ${tableCode(source.format)} | ${source.tokenCount} | ${tableCode(source.warnings.join('; ') || 'none')} |`);
    }
    lines.push('');
  }

  if (missingTokens.length > 0) {
    lines.push('### Tokens Used But Missing');
    lines.push('');
    lines.push('| Token | Files |');
    lines.push('| --- | --- |');
    for (const entry of missingTokens.slice(0, 10)) {
      lines.push(`| ${tableCode(entry.token)} | ${tableCode(fileList(entry.files))} |`);
    }
    lines.push('');
  }

  if (unusedTokens.length > 0) {
    lines.push('### Tokens Defined But Unused');
    lines.push('');
    lines.push('| Token | Value |');
    lines.push('| --- | --- |');
    for (const entry of unusedTokens.slice(0, 10)) {
      lines.push(`| ${tableCode(entry.token)} | ${tableCode((entry.values || []).join(', ') || 'n/a')} |`);
    }
    lines.push('');
  }

  if (rawValueCandidates.length > 0) {
    lines.push('### Repeated Raw Value Candidates');
    lines.push('');
    lines.push('| Value | Count | Files |');
    lines.push('| --- | ---: | --- |');
    for (const entry of rawValueCandidates.slice(0, 10)) {
      lines.push(`| ${tableCode(entry.value)} | ${entry.count} | ${tableCode(fileList(entry.files))} |`);
    }
    lines.push('');
  }

  if (rawValueMatches.length > 0) {
    lines.push('### Raw Values Matching Known Tokens');
    lines.push('');
    lines.push('| Value | Count | Tokens |');
    lines.push('| --- | ---: | --- |');
    for (const entry of rawValueMatches.slice(0, 10)) {
      lines.push(`| ${tableCode(entry.value)} | ${entry.count} | ${tableCode(entry.tokens.join(', '))} |`);
    }
    lines.push('');
  }

  if (conflictingTokens.length > 0) {
    lines.push('### Conflicting Token Values');
    lines.push('');
    lines.push('| Value | Tokens |');
    lines.push('| --- | --- |');
    for (const entry of conflictingTokens.slice(0, 10)) {
      lines.push(`| ${tableCode(entry.value)} | ${tableCode(entry.tokens.join(', '))} |`);
    }
    lines.push('');
  }
}

const NEW_FINDINGS_SHOWN = 25;
const FILES_SHOWN = 5;

/** Five names and a count: a value repeated in 300 files made one table row of 6,900 characters. */
function fileList(files) {
  const shown = files.slice(0, FILES_SHOWN).join(', ');
  return files.length > FILES_SHOWN ? `${shown}, +${files.length - FILES_SHOWN} more` : shown;
}

function appendNewFindingsMarkdown(lines, report) {
  const fresh = (report.baseline && report.baseline.newFindings) || [];
  if (fresh.length === 0) {
    return;
  }
  lines.push('## New Since the Baseline');
  lines.push('');
  lines.push('| Location | Finding |');
  lines.push('| --- | --- |');
  for (const finding of fresh.slice(0, NEW_FINDINGS_SHOWN)) {
    // A code span: finding text can carry values from the project's source, and this goes into a PR comment.
    lines.push(`| ${tableCode(`${finding.file}:${finding.line}`)} | ${tableCode(finding.text || '')} |`);
  }
  if (fresh.length > NEW_FINDINGS_SHOWN) {
    lines.push(`| ${fresh.length - NEW_FINDINGS_SHOWN} more | see \`--format json\` |`);
  }
  lines.push('');
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

  if (report.baselineWritten) {
    lines.push(`Baseline written: ${markdownCode(report.baselineWritten.file)}`);
    lines.push('');
  }
}

function appendMarkdownCounts(lines, title, counts, label = 'Value') {
  const entries = sortCountMap(counts || {});

  if (entries.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`| ${label} | Count |`);
  lines.push('| --- | ---: |');
  for (const [value, count] of entries) {
    lines.push(`| ${tableCode(value)} | ${count} |`);
  }
  lines.push('');
}

module.exports = {
  appendBaselineMarkdown,
  appendMarkdownCounts,
  appendParseErrorsMarkdown,
  appendTokenContractMarkdown,
  renderMarkdown,
};
