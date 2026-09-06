'use strict';

const fs = require('node:fs');

const {
  createTokenKindMatcher,
  parseTokenSources,
} = require('../core/token-sources');
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
const {
  assessScale,
  inferScaleFromDefinitions, discoverTokenPackages, scaleFromDefinitions } = require('../core/scale-inference');
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
    scssFiles: cssResults.scssFiles || 0,
    scssSkipped: cssResults.scssSkipped || 0,
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

const NON_AUTHORED_SEGMENT = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|__fixtures__|__snapshots__|vendor|third[-_]?party|storybook-static)(\/|$)/i;

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

  let rejected = null;
  const definitions = new Map();
  const matchesKind = createTokenKindMatcher('spacing');
  for (const filePath of cssFiles) {
    // Test, fixture and vendored stylesheets often redefine tokens to exercise
    // overrides; they are findings noise and must not shape the inferred scale.
    if (NON_AUTHORED_SEGMENT.test(formatPath(filePath))) {
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    collectTokenDefinitions(text, formatPath(filePath), definitions, matchesKind, baseFontSize);
  }

  if (definitions.size > 0) {
    const inferred = inferScaleFromDefinitions(definitions, baseFontSize);
    if (inferred) {
      const { values } = inferred;
      const files = new Set();
      for (const definition of inferred.definitions.values()) {
        for (const file of definition.files) {
          files.add(file);
        }
      }
      const sortedFiles = Array.from(files).sort();
      const assessment = assessScale({ files: sortedFiles, source: 'scanned-css', values });
      if (assessment.plausible) {
        return {
          files: sortedFiles,
          source: 'scanned-css',
          tokenCount: inferred.definitions.size,
          values,
        };
      }
      rejected = { files: sortedFiles, reasons: assessment.reasons, source: 'scanned-css', values };
    }
  }

  const packageSources = discoverTokenPackages(process.cwd());
  if (packageSources.length > 0) {
    const parsedPackages = parseTokenSources({ baseFontSize, sources: packageSources, tokenKind: 'spacing' });
    const values = scaleFromDefinitions(parsedPackages.definitions, baseFontSize);
    if (values) {
      return {
        files: parsedPackages.sources.map((source) => source.file),
        source: 'token-package',
        tokenCount: parsedPackages.definitions.size,
        values,
      };
    }
  }

  return { files: [], ...(rejected ? { rejected } : {}), source: 'fallback', tokenCount: 0, values: DEFAULT_SCALE };
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
