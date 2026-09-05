'use strict';

const fs = require('node:fs');
const {
  addDefinition,
  collectScssTokens,
  createTokenKindMatcher,
  getNormalizedValueKeys,
} = require('../utils/token-sources');
const { formatPath } = require('./shared');

function collectTokenContract({
  baseFontSize,
  cssFiles,
  cssFindings,
  externalTokenDefinitions,
  minCandidateCount,
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
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
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

function collectTokenDefinitions(source, file, definitions, matchesKind, baseFontSize) {
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let match;

  while ((match = declarationPattern.exec(source)) !== null) {
    const token = match[1];
    if (!matchesKind(token)) {
      continue;
    }

    addDefinition(definitions, {
      baseFontSize,
      file,
      source: file,
      token,
      value: match[2].trim(),
    });
  }

  for (const sassToken of collectScssTokens(source, matchesKind)) {
    addDefinition(definitions, {
      baseFontSize,
      file,
      source: file,
      token: sassToken.token,
      value: sassToken.value,
    });
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
  motionFindings,
  scale,
  scanScope,
  scssFiles = 0,
  scssSkipped = 0,
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

  const totalFiles = cssFiles.length + templateFiles.length;
  const totalWarnings = cssFindings.length + motionFindings.length + tailwindFindings.length;
  const filesWithIssues = issueFiles.size;
  const scaleCleanliness = totalFiles > 0
    ? Math.max(0, Math.round(((totalFiles - filesWithIssues) / totalFiles) * 100))
    : 100;
  const tokenContract = collectTokenContract({
    baseFontSize,
    cssFiles,
    cssFindings,
    externalTokenDefinitions,
    minCandidateCount: tokenCandidateMinCount,
    tailwindFindings,
    tokenKind,
    tokenSourceReports,
  });

  return {
    config,
    cssFilesScanned: cssFiles.length,
    directory: dir,
    filesWithIssues,
    findings: {
      css: cssFindings,
      motion: motionFindings,
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
      cssFiles: cssFiles.length,
      scssFiles,
      scssSkipped,
      templateFiles: templateFiles.length,
      totalFiles,
    },
    summary: {
      cssWarnings: cssFindings.length,
      filesWithIssues,
      motionFindings: motionFindings.length,
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
      motion: report.motion,
      scale: {
        cleanliness: report.scaleCleanliness,
        files: report.scale ? report.scale.files : [],
        offScaleProperties: report.offScaleProperties || {},
        offScaleValues: report.offScaleValues,
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
    findings: { type: 'object' },
    scanned: { type: 'object' },
    schemaVersion: { const: '2.0' },
    summary: { type: 'object' },
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
  countByValue,
  createValueToTokensMap,
  mapTokenEntries,
  sortCountMap,
  sumCounts,
  toAuditContractReport,
};
