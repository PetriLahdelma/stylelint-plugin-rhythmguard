'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
  resolveIgnorePatterns,
} = require('./config');
const { buildReport, collectTokenDefinitions } = require('./contract');
const { DEFAULT_SCALE, formatPath } = require('./shared');
const { TAILWIND_SCALE_NAME, TAILWIND_SPACING_UNIT_REM, tailwindSpacingLadder } = require('../presets/default-scale');

const TAILWIND_CONFIG_FILES = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];

/**
 * Whether the project in `cwd` uses Tailwind: a `tailwindcss` or
 * `@tailwindcss/*` dependency, or a Tailwind config file (found, not loaded).
 * Its `--scale auto` fallback is then Tailwind's ladder, as in configs/tailwind.
 */
function isTailwindProject(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
    if (deps.some((name) => name === 'tailwindcss' || name.startsWith('@tailwindcss/'))) {
      return true;
    }
  } catch {
    // No readable package.json: decide by the config file alone.
  }
  return TAILWIND_CONFIG_FILES.some((file) => fs.existsSync(path.join(cwd, file)));
}
const {
  assessScale,
  discoverTokenPackages,
  inferScaleFromDefinitions,
  scaleFromDefinitions,
  scaleFromTailwindConfig,
} = require('../core/scale-inference');
const { buildGroupScales } = require('../core/options');
const { applyDecisions, buildDecisionPlan } = require('./decisions');
const { collectDeclarations, resolveTokenChains, toChainsContract } = require('./token-chains');
const { resolveTokenLadders, toLaddersContract } = require('./token-ladders');
const { assertDirectory, getScanFiles, readSourceFromDisk, toPosixRelativePath } = require('./scan/files');
const { nonAuthoredReason } = require('./non-authored');
const { collectCssFindings, runStylelintAudit } = require('./scan/stylesheets');
const { collectTailwindFindings, collectTailwindMotionFindings } = require('./scan/templates');

/**
 * What an audit run reads before it lints anything: the files, the token
 * sources and the one resolved scale. `rhythmguard scale` prints the scale
 * from here, so it always names the scale the audit would check against.
 * `parsed` is the options after normalizeCreateAuditOptions.
 */
function prepareAuditRun(parsed) {
  const resolvedDir = assertDirectory(parsed.dir);
  const ignorePatterns = resolveIgnorePatterns(parsed);

  const scanFiles = getScanFiles(resolvedDir, ignorePatterns, parsed);

  const { templateFiles } = scanFiles;
  // A --staged run reads each changed file as the index holds it.
  const readSource = scanFiles.readSource || readSourceFromDisk;

  // Vendored, test, generated and built stylesheets (#161). They never shape
  // the scale or the token chains; unless --include-non-authored, they are
  // not audited either, like a file in a skipped directory.
  const nonAuthored = classifyNonAuthored(scanFiles.cssFiles, resolvedDir, readSource);
  const nonAuthoredSkipped = parsed.includeNonAuthored
    ? []
    : scanFiles.cssFiles.filter((file) => nonAuthored.has(file));
  const cssFiles = parsed.includeNonAuthored
    ? scanFiles.cssFiles
    : scanFiles.cssFiles.filter((file) => !nonAuthored.has(file));

  // A configured source that gives nothing is a warning, not a silent fallback (issue #163).
  const tokenSourceResult = parseTokenSources({
    baseFontSize: parsed.baseFontSize,
    sources: parsed.tokenSources,
    tokenKind: parsed.tokenKind,
    warnWhenEmpty: true,
  });

  // A configured Tailwind config that does not exist is a configuration error,
  // as a missing token source is (the CLI exits 2 on either).
  if (parsed.tailwindConfigPath && !fs.existsSync(path.resolve(process.cwd(), parsed.tailwindConfigPath))) {
    tokenSourceResult.warnings.push(`Tailwind config not found: ${parsed.tailwindConfigPath}`);
  }

  // The spacing scale always reads spacing tokens; --token-kind shapes the token contract only (issue #260).
  const spacingSourceResult = parsed.tokenKind === 'spacing'
    ? tokenSourceResult
    : parseTokenSources({ baseFontSize: parsed.baseFontSize, sources: parsed.tokenSources, tokenKind: 'spacing' });

  // A spacing scale in audit.scales is the one use-scale checks spacing
  // against, so it is the scale the report names and prefer-token reads (#283).
  const groupScales = buildGroupScales(parsed.scales);
  const spacingOverride = groupScales.spacing && Array.isArray(groupScales.spacing.scale) ? groupScales.spacing.scale : null;
  const isNonAuthored = (file) => nonAuthored.has(file);
  const scale = resolveAuditScale({
    baseFontSize: parsed.baseFontSize,
    cssFiles,
    isNonAuthored,
    readSource,
    requested: spacingOverride || parsed.scale,
    tailwindConfigPath: parsed.tailwindConfigPath,
    tokenSourceResult: spacingSourceResult,
    // Loader warnings (a Tailwind config that throws) join the token source warnings (cq-05).
    warnings: tokenSourceResult.warnings,
  });

  // Class strings follow the ESLint rule: with no scale of the project's own
  // (the default, or "auto" finding none), they are judged by Tailwind's
  // default ladder, so the audit and `tailwind-class-use-scale` agree (cs-05).
  const classScale = classStringScale(scale, templateFiles, parsed.baseFontSize);
  if (classScale) {
    scale.classStrings = classScale;
  }

  return {
    classScale,
    cssFiles,
    groupScales,
    isNonAuthored,
    nonAuthored,
    nonAuthoredSkipped,
    readSource,
    resolvedDir,
    scale,
    scanFiles,
    spacingSourceResult,
    templateFiles,
    tokenSourceResult,
  };
}

/**
 * The places the audit knows spacing tokens from, as `scaleSources` entries
 * for prefer-token: the configured token sources that exist, then every
 * authored stylesheet that declares a spacing custom property or Sass token.
 * prefer-token then names the token that holds a raw value, and the file it
 * comes from, as the token contract does (dx-08, ci-01). A token declared in
 * a component block or under a media query in another file is never offered
 * outside it: the rule's token index keeps each declaration's scope.
 */
function tokenScaleSources({ baseFontSize, cssFiles, isNonAuthored, readSource, tokenSources }) {
  const entries = [];
  for (const source of tokenSources || []) {
    if (!source || typeof source !== 'object' || !source.path) {
      continue;
    }
    const resolved = path.resolve(source.baseDir || process.cwd(), source.path);
    if (!fs.existsSync(resolved)) {
      continue;
    }
    entries.push({
      format: source.format || 'auto',
      path: resolved,
      ...(source.tokenPattern ? { tokenPattern: source.tokenPattern } : {}),
    });
  }

  const matchesKind = createTokenKindMatcher('spacing');
  for (const filePath of cssFiles) {
    if (isNonAuthored(filePath)) {
      continue;
    }
    let text;
    try {
      text = readSource(filePath);
    } catch {
      // Unreadable since the scan (deleted, permissions): this pass reads only what it can.
      continue;
    }
    const definitions = new Map();
    collectTokenDefinitions(text, formatPath(filePath), definitions, matchesKind, baseFontSize);
    if (definitions.size > 0) {
      entries.push({ format: 'css', path: path.resolve(filePath) });
    }
  }
  return entries;
}

async function createAuditReport(options) {
  const parsed = normalizeCreateAuditOptions(options);
  const run = prepareAuditRun(parsed);
  const {
    classScale,
    cssFiles,
    groupScales,
    nonAuthored,
    nonAuthoredSkipped,
    readSource,
    resolvedDir,
    scale,
    scanFiles,
    templateFiles,
    tokenSourceResult,
  } = run;
  const { scanScope } = scanFiles;

  const lintOptions = {
    baseFontSize: parsed.baseFontSize,
    checkMathBounds: parsed.checkMathBounds,
    includeMotion: parsed.includeMotion,
    readSource: scanFiles.readSource,
    scale: scale.values,
    scales: parsed.scales,
    tokenScaleSources: tokenScaleSources({
      baseFontSize: parsed.baseFontSize,
      cssFiles,
      isNonAuthored: run.isNonAuthored,
      readSource,
      tokenSources: parsed.tokenSources,
    }),
  };

  const classOptions = classScale ? { ...lintOptions, scale: classScale.values } : lintOptions;

  const cssResults = await runStylelintAudit(cssFiles, lintOptions);
  const collectedCssFindings = collectCssFindings(cssResults, readSource);
  // A stylesheet that failed to parse was not audited; it is reported apart
  // and is neither a finding nor a clean file.
  const parseErrorFindings = collectedCssFindings.filter((finding) => finding.type === 'parse-error');
  const stylelintFindings = collectedCssFindings.filter((finding) => finding.type !== 'parse-error');
  const decided = applyDecisions({
    baseFontSize: parsed.baseFontSize,
    cssFindings: stylelintFindings.filter((finding) => !finding.type.startsWith('motion-')),
    decisions: parsed.decisions || [],
    tailwindFindings: collectTailwindFindings(templateFiles, classOptions),
  });
  const cssFindings = decided.cssFindings;
  const motionFindings = [
    ...stylelintFindings.filter((finding) => finding.type.startsWith('motion-')),
    ...collectTailwindMotionFindings(templateFiles, lintOptions),
  ];

  // Every token a chain can end in: token sources of any kind and installed
  // token packages. Read once, for the chains and for missing tokens.
  const knownDefinitions = chainDefinitions(parsed);
  const report = buildReport({
    baseFontSize: parsed.baseFontSize,
    config: parsed.config,
    cssFiles,
    cssFindings,
    dir: parsed.dir,
    externalTokenDefinitions: tokenSourceResult.definitions,
    includeMotion: parsed.includeMotion,
    knownTokens: parsed.reportMissingTokens === true
      ? knownTokenNames(knownDefinitions, nonAuthoredSkipped, readSource)
      : new Set(),
    linksOutsideRoot: scanFiles.linksOutsideRoot || [],
    motionFindings,
    nonAuthoredFiles: nonAuthoredSkipped.map((file) => ({ file: formatPath(file), reason: nonAuthored.get(file) })),
    parseErrorFindings,
    readSource,
    reportMissingTokens: parsed.reportMissingTokens === true,
    scale,
    scanScope,
    scssFiles: cssResults.scssFiles || 0,
    scssSkipped: cssResults.scssSkipped || 0,
    stylelintIgnored: cssResults.stylelintIgnored || 0,
    stylelintMissing: cssResults.stylelintMissing || 0,
    tailwindFindings: decided.tailwindFindings,
    templateFiles,
    tokenCandidateMinCount: parsed.tokenCandidateMinCount,
    tokenKind: parsed.tokenKind,
    tokenSourceReports: tokenSourceResult.sources,
    tokenSourceWarnings: tokenSourceResult.warnings,
    unauditedFiles: new Set([
      ...(cssResults.unauditedFiles || []),
      ...parseErrorFindings.map((finding) => path.resolve(process.cwd(), finding.file)),
    ]),
  });

  // The files this run scanned, for the CLI's next-step commands (lint globs,
  // parsers). Not enumerable, so no JSON output carries the lists.
  Object.defineProperty(report, 'files', { enumerable: false, value: { cssFiles: [...cssFiles], templateFiles: [...templateFiles] } });

  const declarations = collectDeclarations({
    cssFiles,
    externalDefinitions: tokenSourceResult.definitions,
    readSource,
    skipFile: (file) => nonAuthored.has(path.resolve(file)),
  });
  report.tokenContract.chains = toChainsContract(resolveTokenChains({
    baseFontSize: parsed.baseFontSize,
    declarations,
    references: collectDeclarations({ cssFiles: [], externalDefinitions: knownDefinitions }),
    scale: scale.values,
  }));
  report.tokenContract.ladders = toLaddersContract(resolveTokenLadders({
    baseFontSize: parsed.baseFontSize,
    declarations,
    minStepPx: parsed.ladderMinStepPx,
  }));
  report.decisions = decided.summary;
  report.decisionPlan = buildDecisionPlan({
    baseFontSize: parsed.baseFontSize,
    decisions: parsed.decisions || [],
    groupScales,
    offScaleFindings: [
      ...stylelintFindings.filter((finding) => finding.type === 'off-scale'),
      ...collectTailwindFindings(templateFiles, classOptions),
    ],
    scale: scale.values,
  });

  if (parsed.sinceBaseline || parsed.writeBaseline) {
    const unauditedFiles = [
      ...(cssResults.unauditedFiles || []),
      // A skipped non-authored stylesheet was not audited: its baseline findings are neither resolved nor new.
      ...nonAuthoredSkipped,
      ...parseErrorFindings.map((finding) => path.resolve(process.cwd(), finding.file)),
    ];
    const unaudited = new Set(unauditedFiles);
    const baselineScope = {
      auditedFiles: [...cssFiles, ...templateFiles].filter((file) => !unaudited.has(file)),
      scanRoot: resolvedDir,
      scoped: scanScope.mode !== 'full',
      unauditedFiles,
    };

    if (parsed.sinceBaseline) {
      applyBaselineComparison(report, parsed.baselinePath, baselineScope);
    }

    if (parsed.writeBaseline) {
      writeBaseline(report, parsed.baselinePath, baselineScope);
    }
  }

  return report;
}

/**
 * Token names defined outside the token contract's own definitions: token
 * sources of any kind, installed token packages, and the vendored or built
 * stylesheets the audit skips. A `var()` of one of these is not a missing token.
 */
function knownTokenNames(knownDefinitions, skippedCssFiles, readSource) {
  const names = new Set(knownDefinitions.keys());
  const matchesAll = createTokenKindMatcher('all');
  for (const filePath of skippedCssFiles) {
    let text;
    try {
      text = readSource(filePath);
    } catch {
      // Unreadable since the scan (deleted, permissions): this pass reads only what it can.
      continue;
    }
    const definitions = new Map();
    collectTokenDefinitions(text, formatPath(filePath), definitions, matchesAll, 16);
    for (const token of definitions.keys()) {
      names.add(token);
    }
  }
  return names;
}

/**
 * Every custom property a chain can end in: all tokens in the token sources,
 * whatever --token-kind says and whatever name pattern a source sets, plus
 * installed token packages (issue #259). A chain through `--size-8` or a
 * package's `--space-2` resolves instead of reading "not declared"; these are
 * looked up only, never reported as chains of their own.
 */
function chainDefinitions(parsed) {
  const unfiltered = (source) => (source && typeof source === 'object' ? { ...source, tokenPattern: null } : source);
  return parseTokenSources({
    baseFontSize: parsed.baseFontSize,
    sources: [...parsed.tokenSources, ...discoverTokenPackages(process.cwd())].map(unfiltered),
    tokenKind: 'all',
  }).definitions;
}

/**
 * The non-authored stylesheets among `cssFiles` (absolute paths), each with
 * its reason (`path`, `minified` or `bundle`), judged by the path relative to
 * the audited directory: auditing `dist` itself still skips the built bundles
 * in it, by name or by shape, and a project checked out under a `vendor`
 * directory is not skipped as a whole.
 */
function classifyNonAuthored(cssFiles, rootDir, readSource) {
  const classified = new Map();
  for (const file of cssFiles) {
    const reason = nonAuthoredReason(toPosixRelativePath(rootDir, file), () => readSource(file));
    if (reason) {
      classified.set(file, reason);
    }
  }
  return classified;
}

/**
 * The scale class strings are checked against when it differs from the
 * stylesheet scale: Tailwind's default ladder, when the stylesheet scale is the
 * built-in default or the fallback and there are template files to check.
 */
function classStringScale(scale, templateFiles, baseFontSize) {
  if (templateFiles.length === 0 || (scale.source !== 'default' && scale.source !== 'fallback')) {
    return null;
  }
  return {
    name: TAILWIND_SCALE_NAME,
    source: 'tailwind-default',
    values: tailwindSpacingLadder(baseFontSize * TAILWIND_SPACING_UNIT_REM),
  };
}

/**
 * One project-level scale for the whole audit, with provenance.
 * "auto": external token sources, then spacing custom properties across the scanned
 * CSS, then the default scale. First source that yields values wins.
 */
function resolveAuditScale({ baseFontSize, cssFiles, isNonAuthored = () => false, readSource = readSourceFromDisk, requested, tailwindConfigPath = null, tokenSourceResult, warnings = [] }) {
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

  // Configured token sources that gave no scale are a rejection with reasons,
  // as an inferred set is, not a silent fallback (tf-02).
  let rejected = null;
  if (tokenSourceResult.sources.length > 0) {
    const reasons = tokenSourceResult.sources.flatMap((source) => source.warnings || []);
    rejected = {
      files: tokenSourceResult.sources.map((source) => source.file),
      reasons: reasons.length > 0 ? reasons : ['no spacing token carries a length'],
      source: 'token-sources',
      values: [],
    };
  }
  const definitions = new Map();
  const matchesKind = createTokenKindMatcher('spacing');
  for (const filePath of cssFiles) {
    // Test, fixture and vendored stylesheets often redefine tokens to exercise
    // overrides; they must not shape the inferred scale, even when audited.
    if (isNonAuthored(filePath)) {
      continue;
    }
    let text;
    try {
      text = readSource(filePath);
    } catch {
      // Unreadable since the scan (deleted, permissions): this pass reads only what it can.
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
      rejected = rejected || { files: sortedFiles, reasons: assessment.reasons, source: 'scanned-css', values };
    }
  }

  // A Tailwind v3 config, only when one is configured: loading it runs it (tf-06).
  if (tailwindConfigPath && fs.existsSync(path.resolve(process.cwd(), tailwindConfigPath))) {
    const values = scaleFromTailwindConfig(path.resolve(process.cwd(), tailwindConfigPath), baseFontSize, { warnings });
    if (values) {
      return { files: [formatPath(path.resolve(process.cwd(), tailwindConfigPath))], source: 'tailwind', tokenCount: values.length - 1, values };
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

  // The fallback the rules use: configs/tailwind falls back to Tailwind's ladder, the rest to DEFAULT_SCALE.
  const tailwind = isTailwindProject(process.cwd());
  return {
    files: [],
    preset: tailwind ? 'tailwind' : 'rhythmic-4',
    ...(rejected ? { rejected } : {}),
    source: 'fallback',
    tokenCount: 0,
    values: tailwind ? tailwindSpacingLadder(baseFontSize * TAILWIND_SPACING_UNIT_REM) : DEFAULT_SCALE,
  };
}

function normalizeCreateAuditOptions(rawOptions) {
  // A key set to undefined is an omitted key: it neither replaces a default nor
  // counts as given, so the config file still applies to it (#284).
  const options = Object.fromEntries(
    Object.entries(rawOptions || {}).filter(([, value]) => value !== undefined),
  );
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
  prepareAuditRun,
  tokenScaleSources,
};
