'use strict';

const fs = require('node:fs');

const {
  createTokenKindMatcher,
  parseTokenSources,
} = require('../utils/token-sources');
const {
  applyBaselineComparison,
  writeBaseline,
} = require('./baseline');
const { createDefaultAuditOptions } = require('./shared');
const {
  applyAuditConfig,
  loadAuditConfig,
  loadIgnorePatterns,
} = require('./config');
const { buildReport, collectTokenDefinitions } = require('./contract');
const { DEFAULT_SCALE, formatPath } = require('./shared');
const { scaleFromDefinitions } = require('../utils/scale-inference');
const {
  assertDirectory,
  collectCssFindings,
  collectTailwindFindings,
  collectTailwindMotionFindings,
  getScanFiles,
  runStylelintAudit,
} = require('./scan');

async function createAuditReport(options) {
  const parsed = normalizeCreateAuditOptions(options);
  const resolvedDir = assertDirectory(parsed.dir);
  let ignorePatterns;
  ignorePatterns = [
    ...loadIgnorePatterns(parsed.ignorePath),
    ...parsed.ignorePatterns,
  ];

  const scanFiles = getScanFiles(resolvedDir, ignorePatterns, parsed);

  const { cssFiles, scanScope, templateFiles } = scanFiles;

  const tokenSourceResult = parseTokenSources({
    baseFontSize: parsed.baseFontSize,
    sources: parsed.tokenSources,
    tokenKind: parsed.tokenKind,
  });

  const scale = resolveAuditScale({
    baseFontSize: parsed.baseFontSize,
    cssFiles,
    requested: parsed.scale,
    tokenSourceResult,
  });

  const lintOptions = {
    baseFontSize: parsed.baseFontSize,
    includeMotion: parsed.includeMotion,
    scale: scale.values,
  };

  const cssResults = await runStylelintAudit(cssFiles, lintOptions);
  const stylelintFindings = collectCssFindings(cssResults);
  const cssFindings = stylelintFindings.filter((finding) => !finding.type.startsWith('motion-'));
  const motionFindings = [
    ...stylelintFindings.filter((finding) => finding.type.startsWith('motion-')),
    ...collectTailwindMotionFindings(templateFiles, lintOptions),
  ];

  const report = buildReport({
    baseFontSize: parsed.baseFontSize,
    config: parsed.config,
    cssFiles,
    cssFindings,
    dir: parsed.dir,
    externalTokenDefinitions: tokenSourceResult.definitions,
    includeMotion: parsed.includeMotion,
    motionFindings,
    scale,
    scanScope,
    tailwindFindings: collectTailwindFindings(templateFiles, lintOptions),
    templateFiles,
    tokenCandidateMinCount: parsed.tokenCandidateMinCount,
    tokenKind: parsed.tokenKind,
    tokenSourceReports: tokenSourceResult.sources,
    tokenSourceWarnings: tokenSourceResult.warnings,
  });

  if (parsed.sinceBaseline) {
    applyBaselineComparison(report, parsed.baselinePath);
  }

  if (parsed.writeBaseline) {
    writeBaseline(report, parsed.baselinePath);
  }

  return report;
}

/**
 * One project-level scale for the whole audit, with provenance.
 * "auto": external token sources, then spacing custom properties across the scanned
 * CSS, then the default scale. First source that yields values wins.
 */
function resolveAuditScale({ baseFontSize, cssFiles, requested, tokenSourceResult }) {
  if (Array.isArray(requested)) {
    return {
      files: [],
      source: requested === DEFAULT_SCALE ? 'default' : 'explicit',
      tokenCount: 0,
      values: requested,
    };
  }

  if (tokenSourceResult.definitions.size > 0) {
    const values = scaleFromDefinitions(tokenSourceResult.definitions, baseFontSize);
    if (values) {
      return {
        files: tokenSourceResult.sources.map((source) => source.file),
        source: 'token-sources',
        tokenCount: tokenSourceResult.definitions.size,
        values,
      };
    }
  }

  const definitions = new Map();
  const matchesKind = createTokenKindMatcher('spacing');
  for (const filePath of cssFiles) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    collectTokenDefinitions(text, formatPath(filePath), definitions, matchesKind, baseFontSize);
  }

  if (definitions.size > 0) {
    const values = scaleFromDefinitions(definitions, baseFontSize);
    if (values) {
      const files = new Set();
      for (const definition of definitions.values()) {
        for (const file of definition.files) {
          files.add(file);
        }
      }
      return {
        files: Array.from(files).sort(),
        source: 'scanned-css',
        tokenCount: definitions.size,
        values,
      };
    }
  }

  return { files: [], source: 'fallback', tokenCount: 0, values: DEFAULT_SCALE };
}

function normalizeCreateAuditOptions(options = {}) {
  const parsed = {
    ...createDefaultAuditOptions(),
    ...options,
    cliOptions: options.cliOptions instanceof Set
      ? options.cliOptions
      : new Set(Object.keys(options)),
  };

  if (!Array.isArray(parsed.ignorePatterns)) {
    parsed.ignorePatterns = [];
  }

  if (!Array.isArray(parsed.tokenSources)) {
    parsed.tokenSources = [];
  }

  if (parsed.configApplied) {
    delete parsed.cliOptions;
    return parsed;
  }

  return applyAuditConfig(parsed, loadAuditConfig(parsed));
}

module.exports = {
  createAuditReport,
  normalizeCreateAuditOptions,
};
