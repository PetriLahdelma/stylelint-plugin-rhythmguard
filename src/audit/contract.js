'use strict';

const fs = require('node:fs');
const {
  addDefinition,
  collectCssTokens,
  createTokenKindMatcher,
  getNormalizedValueKeys,
  hasLineComments,
} = require('../core/token-sources');
const { formatPath } = require('./shared');

function collectTokenContract({
  baseFontSize,
  cssFiles,
  cssFindings,
  externalTokenDefinitions,
  minCandidateCount,
  readSource = (filePath) => fs.readFileSync(filePath, 'utf8'),
  tailwindFindings,
  tokenKind,
  tokenSourceReports,
}) {
  const definitions = new Map();
  const uses = new Map();
  const rawValues = new Map();
  const rawValueLocations = new Set();
  const matchesKind = createTokenKindMatcher(tokenKind);

  for (const filePath of cssFiles) {
    let source;
    try {
      source = readSource(filePath);
    } catch {
      continue;
    }

    const file = formatPath(filePath);
    collectTokenDefinitions(source, file, definitions, matchesKind, baseFontSize);
    collectTokenUses(source, file, uses, matchesKind);
  }

  for (const entry of externalTokenDefinitions.values()) {
    for (const value of entry.values || []) {
      addDefinition(definitions, {
        baseFontSize,
        file: Array.from(entry.files)[0] || 'external-token-source',
        source: Array.from(entry.sources)[0] || Array.from(entry.files)[0] || 'external-token-source',
        token: entry.token,
        value,
      });
    }
  }

  for (const finding of cssFindings) {
    addRawValue(rawValues, rawValueLocations, finding.value, finding);
  }

  for (const finding of tailwindFindings) {
    addRawValue(rawValues, rawValueLocations, finding.rawValue, finding);
  }

  const definedTokens = mapTokenEntries(definitions);
  const usedTokens = mapTokenEntries(uses);
  const missingTokens = usedTokens.filter(({ token }) => !definitions.has(token));
  const unusedTokens = definedTokens.filter(({ token }) => !uses.has(token));
  const rawValueMatches = collectRawValueMatches(rawValues, definitions, baseFontSize);
  const conflictingTokens = collectConflictingTokens(definitions);
  const rawValueCandidates = Array.from(rawValues.entries())
    .map(([value, entry]) => ({
      count: entry.count,
      files: Array.from(entry.files).sort(),
      value,
    }))
    .filter(({ count }) => count >= minCandidateCount)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    definedTokens,
    conflictingTokens,
    missingTokens,
    rawValueMatches,
    rawValueCandidates,
    sources: tokenSourceReports,
    summary: {
      conflictingTokens: conflictingTokens.length,
      definedTokens: definedTokens.length,
      missingTokens: missingTokens.length,
      rawValueMatches: rawValueMatches.length,
      rawValueCandidates: rawValueCandidates.length,
      tokenSources: tokenSourceReports.length,
      unusedTokens: unusedTokens.length,
      usedTokens: usedTokens.length,
    },
    unusedTokens,
    usedTokens,
  };
}

/** Custom properties and Sass tokens declared in one stylesheet, added to the definitions map. */
function collectTokenDefinitions(source, file, definitions, matchesKind, baseFontSize) {
  for (const { scope, token, value } of collectCssTokens(source, matchesKind, { lineComments: hasLineComments(file) })) {
    addDefinition(definitions, { baseFontSize, file, scope, source: file, token, value });
  }
}

function collectTokenUses(source, file, uses, matchesKind) {
  const varPattern = /var\(\s*(--[\w-]+)/g;
  let match;

  while ((match = varPattern.exec(source)) !== null) {
    const token = match[1];
    if (!matchesKind(token)) {
      continue;
    }

    const entry = uses.get(token) || {
      files: new Set(),
      token,
    };
    entry.files.add(file);
    uses.set(token, entry);
  }
}

function addRawValue(rawValues, rawValueLocations, value, finding) {
  if (!value) {
    return;
  }

  const locationKey = [
    finding.file || '',
    finding.line || '',
    finding.column || '',
    value,
  ].join('\u001f');
  if (rawValueLocations.has(locationKey)) {
    return;
  }
  rawValueLocations.add(locationKey);

  const entry = rawValues.get(value) || {
    count: 0,
    files: new Set(),
  };
  entry.count += 1;
  if (finding.file) {
    entry.files.add(finding.file);
  }
  rawValues.set(value, entry);
}

function mapTokenEntries(entries) {
  return Array.from(entries.values())
    .map((entry) => ({
      files: Array.from(entry.files).sort(),
      normalizedValues: entry.normalizedValues
        ? Array.from(entry.normalizedValues).sort()
        : undefined,
      sources: entry.sources ? Array.from(entry.sources).sort() : undefined,
      token: entry.token,
      values: entry.values ? Array.from(entry.values).sort() : undefined,
    }))
    .sort((a, b) => a.token.localeCompare(b.token));
}

function collectRawValueMatches(rawValues, definitions, baseFontSize) {
  const valueToTokens = createValueToTokensMap(definitions);
  const matches = [];

  for (const [value, entry] of rawValues.entries()) {
    const tokens = new Set();
    for (const key of getNormalizedValueKeys(value, baseFontSize)) {
      for (const token of valueToTokens.get(key) || []) {
        tokens.add(token);
      }
    }

    if (tokens.size === 0) {
      continue;
    }

    matches.push({
      count: entry.count,
      files: Array.from(entry.files).sort(),
      tokens: Array.from(tokens).sort(),
      value,
    });
  }

  return matches.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function collectConflictingTokens(definitions) {
  const valueToTokens = createValueToTokensMap(definitions);
  const conflicts = [];

  for (const [value, tokens] of valueToTokens.entries()) {
    const uniqueTokens = Array.from(tokens).sort();
    if (uniqueTokens.length < 2) {
      continue;
    }

    conflicts.push({
      tokens: uniqueTokens,
      value,
    });
  }

  return conflicts.sort((a, b) => a.value.localeCompare(b.value));
}

function createValueToTokensMap(definitions) {
  const valueToTokens = new Map();

  for (const entry of definitions.values()) {
    for (const value of entry.normalizedValues || []) {
      const tokens = valueToTokens.get(value) || new Set();
      tokens.add(entry.token);
      valueToTokens.set(value, tokens);
    }
  }

  return valueToTokens;
}

function buildReport({
  baseFontSize,
  config,
  cssFiles,
  cssFindings,
  dir,
  externalTokenDefinitions,
  includeMotion,
  linksOutsideRoot = [],
  motionFindings,
  nonAuthoredFiles = [],
  parseErrorFindings = [],
  readSource,
  scale,
  scanScope,
  scssFiles = 0,
  scssSkipped = 0,
  stylelintIgnored = 0,
  templateFiles,
  tailwindFindings,
  tokenCandidateMinCount,
  tokenKind,
  tokenSourceReports,
  tokenSourceWarnings,
}) {
  const offScaleValues = countByValue(cssFindings
    .filter((finding) => finding.type === 'off-scale' && finding.value)
    .map((finding) => finding.value));
  const offScaleProperties = countByValue(cssFindings
    .filter((finding) => finding.type === 'off-scale' && finding.property)
    .map((finding) => finding.property));
  const tokenOpportunities = countByValue(cssFindings
    .filter((finding) => finding.type === 'token-opportunity' && finding.value)
    .map((finding) => finding.value));
  const tailwindArbitraryValues = countByValue(tailwindFindings
    .map((finding) => finding.rawValue));
  const motionValues = countByValue(motionFindings
    .map((finding) => finding.value || finding.rawValue));
  const issueFiles = new Set([
    ...cssFindings.map((finding) => finding.file),
    ...motionFindings.map((finding) => finding.file),
    ...tailwindFindings.map((finding) => finding.file),
  ]);
  const topAffectedFiles = sortCountMap(countByValue([
    ...cssFindings.map((finding) => finding.file),
    ...motionFindings.map((finding) => finding.file),
    ...tailwindFindings.map((finding) => finding.file),
  ])).slice(0, 10);

  // A stylesheet skipped for want of postcss-scss, or excluded by the project's
  // .stylelintignore, was not audited: it is neither scanned nor clean.
  const cssFilesScanned = Math.max(0, cssFiles.length - scssSkipped - stylelintIgnored);
  const totalFiles = cssFilesScanned + templateFiles.length;
  const totalWarnings = cssFindings.length + motionFindings.length + tailwindFindings.length;
  const filesWithIssues = issueFiles.size;
  const scaleCleanliness = Math.floor(computeScaleCleanliness({
    filesWithIssues,
    parseErrorFiles: countFiles(parseErrorFindings),
    totalFiles,
  }));
  const tokenContract = collectTokenContract({
    baseFontSize,
    cssFiles,
    cssFindings,
    externalTokenDefinitions,
    minCandidateCount: tokenCandidateMinCount,
    readSource,
    tailwindFindings,
    tokenKind,
    tokenSourceReports,
  });

  return {
    config,
    cssFilesScanned,
    directory: dir,
    filesWithIssues,
    findings: {
      css: cssFindings,
      motion: motionFindings,
      parseErrors: parseErrorFindings,
      tailwind: tailwindFindings,
    },
    formatVersion: 5,
    motion: {
      enabled: includeMotion,
      findings: motionFindings.length,
      values: Object.fromEntries(sortCountMap(motionValues).slice(0, 10)),
    },
    offScaleProperties: Object.fromEntries(sortCountMap(offScaleProperties).slice(0, 10)),
    offScaleValues: Object.fromEntries(sortCountMap(offScaleValues).slice(0, 10)),
    scale: scale || null,
    scaleCleanliness,
    scanScope,
    scanned: {
      cssFiles: cssFilesScanned,
      scssFiles,
      scssSkipped,
      stylelintIgnored,
      // Vendored, minified or built stylesheets left out of the audit (#161).
      nonAuthoredSkipped: nonAuthoredFiles.length,
      nonAuthoredFiles,
      templateFiles: templateFiles.length,
      totalFiles,
      // Symbolic links that resolve outside the scanned directory: not followed (#289).
      ...(linksOutsideRoot.length > 0 ? { linksOutsideRoot: linksOutsideRoot.length } : {}),
    },
    summary: {
      cssWarnings: cssFindings.length,
      filesWithIssues,
      motionFindings: motionFindings.length,
      parseErrors: parseErrorFindings.length,
      rawValueMatches: tokenContract.summary.rawValueMatches,
      missingTokens: tokenContract.summary.missingTokens,
      rawValueCandidates: tokenContract.summary.rawValueCandidates,
      scaleCleanliness,
      tailwindArbitrarySpacing: tailwindFindings.length,
      tokenOpportunities: sumCounts(tokenOpportunities),
      tokenSources: tokenContract.summary.tokenSources,
      totalFindings: totalWarnings,
      unusedTokens: tokenContract.summary.unusedTokens,
    },
    tailwindArbitraryValues: Object.fromEntries(sortCountMap(tailwindArbitraryValues).slice(0, 10)),
    templateFilesScanned: templateFiles.length,
    tokenContract,
    tokenSourceWarnings,
    tokenOpportunities: Object.fromEntries(sortCountMap(tokenOpportunities).slice(0, 10)),
    topAffectedFiles: topAffectedFiles.map(([file, count]) => ({ count, file })),
    totalFiles,
    totalWarnings,
  };
}

/**
 * The share of audited files with no finding, unrounded. A file that failed to
 * parse was not audited, so it is out of the denominator. The report shows the
 * floor of this, so it never reads 100% while a file has a finding, and the
 * --min-cleanliness gate compares this exact value.
 */
function computeScaleCleanliness({ filesWithIssues, parseErrorFiles = 0, totalFiles }) {
  const auditedFiles = totalFiles - parseErrorFiles;
  if (auditedFiles <= 0) {
    return 100;
  }
  return Math.max(0, ((auditedFiles - filesWithIssues) * 100) / auditedFiles);
}

/** The unrounded cleanliness of a built report. */
function exactScaleCleanliness(report) {
  if (!Number.isFinite(report.totalFiles) || !Number.isFinite(report.filesWithIssues)) {
    return report.scaleCleanliness;
  }
  return computeScaleCleanliness({
    filesWithIssues: report.filesWithIssues,
    parseErrorFiles: countFiles((report.findings && report.findings.parseErrors) || []),
    totalFiles: report.totalFiles,
  });
}

function countFiles(findings) {
  return new Set(findings.map((finding) => finding.file)).size;
}

function countByValue(values) {
  const counts = {};

  for (const value of values) {
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }

  return counts;
}

function sortCountMap(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sumCounts(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function toAuditContractReport(report) {
  return {
    baseline: report.baseline || null,
    command: {
      config: report.config,
      directory: report.directory,
      scanScope: report.scanScope.mode,
    },
    contracts: {
      decisions: report.decisions || null,
      motion: report.motion,
      scale: {
        cleanliness: report.scaleCleanliness,
        files: report.scale ? report.scale.files : [],
        offScaleProperties: report.offScaleProperties || {},
        offScaleValues: report.offScaleValues,
        rejected: report.scale && report.scale.rejected ? report.scale.rejected : null,
        source: report.scale ? report.scale.source : 'default',
        tokenOpportunities: report.tokenOpportunities,
        values: report.scale ? report.scale.values : null,
      },
      tokens: report.tokenContract,
    },
    findings: report.findings,
    scanned: report.scanned,
    schemaVersion: '2.0',
    summary: report.summary,
  };
}

const AUDIT_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  additionalProperties: true,
  properties: {
    baseline: { type: ['object', 'null'] },
    command: { type: 'object' },
    contracts: { type: 'object' },
    findings: {
      additionalProperties: true,
      properties: {
        css: { type: 'array' },
        motion: { type: 'array' },
        parseErrors: {
          description: 'Stylesheets that could not be parsed and so were not audited. Not counted as findings or in cleanliness.',
          items: {
            additionalProperties: true,
            properties: {
              column: { type: 'integer' },
              file: { type: 'string' },
              line: { type: 'integer' },
              rule: { const: 'CssSyntaxError' },
              text: { type: 'string' },
              type: { const: 'parse-error' },
            },
            required: ['file', 'text', 'type'],
            type: 'object',
          },
          type: 'array',
        },
        tailwind: { type: 'array' },
      },
      type: 'object',
    },
    scanned: {
      additionalProperties: true,
      properties: {
        nonAuthoredFiles: {
          description: 'Stylesheets not audited because they look vendored, generated, test-only, minified or built. Empty with --include-non-authored.',
          items: {
            additionalProperties: false,
            properties: {
              file: { type: 'string' },
              reason: { enum: ['path', 'minified', 'bundle'] },
            },
            required: ['file', 'reason'],
            type: 'object',
          },
          type: 'array',
        },
        nonAuthoredSkipped: {
          description: 'Number of stylesheets in nonAuthoredFiles.',
          minimum: 0,
          type: 'integer',
        },
      },
      type: 'object',
    },
    schemaVersion: { const: '2.0' },
    summary: {
      additionalProperties: true,
      properties: {
        parseErrors: {
          description: 'Number of stylesheets that could not be parsed.',
          minimum: 0,
          type: 'integer',
        },
        scaleCleanliness: {
          description: 'Percentage of audited files with no finding, rounded down.',
          maximum: 100,
          minimum: 0,
          type: 'integer',
        },
        totalFindings: { minimum: 0, type: 'integer' },
      },
      type: 'object',
    },
  },
  required: ['schemaVersion', 'command', 'summary', 'scanned', 'contracts', 'findings'],
  title: 'Rhythmguard Audit Report',
  type: 'object',
});

module.exports = {
  AUDIT_JSON_SCHEMA,
  addRawValue,
  buildReport,
  collectConflictingTokens,
  collectRawValueMatches,
  collectTokenContract,
  collectTokenDefinitions,
  collectTokenUses,
  computeScaleCleanliness,
  countByValue,
  createValueToTokensMap,
  exactScaleCleanliness,
  mapTokenEntries,
  sortCountMap,
  sumCounts,
  toAuditContractReport,
};
