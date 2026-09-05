'use strict';

const {
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
const { buildReport } = require('./contract');
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
  const lintOptions = {
    baseFontSize: parsed.baseFontSize,
    includeMotion: parsed.includeMotion,
    scale: parsed.scale,
  };

  const cssResults = await runStylelintAudit(cssFiles, lintOptions);

  const tokenSourceResult = parseTokenSources({
    baseFontSize: parsed.baseFontSize,
    sources: parsed.tokenSources,
    tokenKind: parsed.tokenKind,
  });
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
