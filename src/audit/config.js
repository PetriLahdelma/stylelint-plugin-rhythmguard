'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeDecisions } = require('../core/decisions');
const { readJsonFile } = require('../core/json');
const { SCALED_GROUPS, isGroupScalesMap } = require('../core/options');
const { normalizeTokenKind } = require('../core/token-sources');
const { normalizeTokenSourceEntry } = require('../core/token-source-entries');
const {
  parseBaseFontSize,
  parseNonNegativeInteger,
  parsePathOption,
  parsePercentage,
  parsePositiveInteger,
  parseScale,
  validateScale,
} = require('./args');
const {
  DEFAULT_IGNORE_PATH,
  createDefaultAuditOptions,
  formatPath,
  normalizeIgnorePattern,
} = require('./shared');


function loadAuditConfig(parsed) {
  parsed = {
    ...createDefaultAuditOptions(),
    ...parsed,
  };

  if (parsed.noConfig) {
    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), parsed.configPath);
  if (!fs.existsSync(resolvedPath)) {
    if (parsed.configExplicit) {
      throw new Error(`Config file not found: ${parsed.configPath}`);
    }
    return null;
  }

  let config;
  try {
    config = readJsonFile(resolvedPath);
  } catch (err) {
    throw new Error(`Invalid Rhythmguard config ${parsed.configPath}: ${err.message}`, { cause: err });
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid Rhythmguard config ${parsed.configPath}: expected an object.`);
  }

  const audit = config.audit || {};
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw new Error(`Invalid Rhythmguard config ${parsed.configPath}: "audit" must be an object.`);
  }

  return {
    audit,
    decisions: config.decisions,
    file: formatPath(resolvedPath),
    rootDir: path.dirname(resolvedPath),
  };
}

function applyAuditConfig(parsed, configResult) {
  const cliOptions = parsed.cliOptions;
  const next = {
    ...parsed,
    config: configResult
      ? {
        file: configResult.file,
      }
      : null,
  };

  if (!configResult) {
    next.tokenSources = normalizeCliTokenSources(parsed.tokenSources, parsed.tokenSourceFormat);
    next.decisions = [];
    delete next.cliOptions;
    return next;
  }

  const audit = configResult.audit;

  if (Array.isArray(audit.ignore)) {
    next.ignorePatterns = [
      ...audit.ignore.map((pattern) => normalizeIgnorePattern(pattern)).filter(Boolean),
      ...parsed.ignorePatterns,
    ];
  }

  const configuredTokenSources = normalizeConfigTokenSources(
    audit.tokenSources,
    configResult.rootDir,
  );
  next.tokenSources = [
    ...configuredTokenSources,
    ...normalizeCliTokenSources(parsed.tokenSources, parsed.tokenSourceFormat),
  ];

  applyConfigScalar(next, audit, cliOptions, 'ignorePath', 'ignorePath', parsePathOption);
  applyConfigScalar(next, audit, cliOptions, 'baselinePath', 'baseline', parsePathOption);
  applyConfigScalar(next, audit, cliOptions, 'maxFindings', 'maxFindings', parseNonNegativeInteger);
  applyConfigScalar(next, audit, cliOptions, 'minCleanliness', 'minCleanliness', parsePercentage);
  applyConfigScalar(next, audit, cliOptions, 'tokenCandidateMinCount', 'tokenCandidateMinCount', parsePositiveInteger);
  applyConfigScalar(next, audit, cliOptions, 'tokenKind', 'tokenKind', normalizeTokenKind);
  applyConfigScalar(next, audit, cliOptions, 'baseFontSize', 'baseFontSize', parseBaseFontSize);
  applyConfigScalar(next, audit, cliOptions, 'includeMotion', 'includeMotion', parseBooleanOption);
  applyConfigScalar(next, audit, cliOptions, 'checkMathBounds', 'checkMathBounds', parseBooleanOption);
  applyConfigScalar(next, audit, cliOptions, 'scales', 'scales', parseGroupScales);
  if (audit.ladders !== undefined) {
    next.ladderMinStepPx = parseLadderOptions(audit.ladders);
  }
  applyConfigScalar(next, audit, cliOptions, 'scale', 'scale', (value) => {
    if (Array.isArray(value)) {
      return validateScale(value, 'audit.scale');
    }
    return parseScale(String(value), 'audit.scale');
  });

  next.decisions = normalizeDecisions(configResult.decisions, { baseFontSize: next.baseFontSize });

  delete next.cliOptions;
  return next;
}

function applyConfigScalar(target, audit, cliOptions, targetKey, configKey, parser) {
  if (cliOptions.has(targetKey) || audit[configKey] === undefined) {
    return;
  }

  target[targetKey] = parser(audit[configKey], configKey);
}

function parseLadderOptions(value) {
  const minStepPx = value && typeof value === 'object' && !Array.isArray(value) ? value.minStepPx : undefined;
  if (typeof minStepPx !== 'number' || !Number.isFinite(minStepPx) || minStepPx < 0) {
    throw new Error('ladders.minStepPx must be a non-negative number of px.');
  }

  return minStepPx;
}

function parseGroupScales(value, optionName) {
  if (!isGroupScalesMap(value)) {
    throw new Error(`${optionName} must map ${SCALED_GROUPS.join(', ')} to a scale, a preset name or "auto".`);
  }

  return value;
}

function parseBooleanOption(value, optionName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${optionName} must be a boolean.`);
  }

  return value;
}

function normalizeCliTokenSources(sources, format) {
  return sources.map((source) => {
    // The programmatic API may pass typed { path | file, format?, baseDir? } entries.
    if (source && typeof source === 'object') {
      return {
        baseDir: source.baseDir || process.cwd(),
        format: source.format || format,
        path: source.path || source.file,
        ...(typeof source.tokenPattern === 'string' && source.tokenPattern ? { tokenPattern: source.tokenPattern } : {}),
      };
    }
    return {
      baseDir: process.cwd(),
      format,
      path: source,
    };
  });
}

function normalizeConfigTokenSources(sources, baseDir) {
  if (sources === undefined) {
    return [];
  }

  if (!Array.isArray(sources)) {
    throw new Error('Invalid Rhythmguard config: audit.tokenSources must be an array.');
  }

  // The lint reads the same entries through the same normaliser, so both see the same files.
  return sources.map((source) => {
    const { error, source: normalized } = normalizeTokenSourceEntry(source, baseDir);
    if (error) {
      // A bad format already reads "Invalid token source format ..."; structural problems name the config.
      throw new Error(/^Invalid /.test(error) ? error : `Invalid Rhythmguard config: ${error}`);
    }
    return normalized;
  });
}

function loadIgnorePatterns(ignorePath) {
  if (!ignorePath) {
    return [];
  }

  const resolvedPath = path.resolve(process.cwd(), ignorePath);
  if (!fs.existsSync(resolvedPath)) {
    if (ignorePath === DEFAULT_IGNORE_PATH) {
      return [];
    }
    throw new Error(`Ignore file not found: ${ignorePath}`);
  }

  return fs.readFileSync(resolvedPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeIgnorePattern(line))
    .filter(Boolean);
}

/**
 * The ignore list a run uses: the ignore file (.rhythmguardignore unless
 * --ignore-path or audit.ignorePath names another), then audit.ignore and
 * --ignore. `parsed` is the options after applyAuditConfig. The audit and
 * `rhythmguard fix` both call this, so they never disagree on what is skipped.
 */
function resolveIgnorePatterns(parsed) {
  return [
    ...loadIgnorePatterns(parsed.ignorePath),
    ...parsed.ignorePatterns,
  ];
}

module.exports = {
  applyAuditConfig,
  applyConfigScalar,
  loadAuditConfig,
  loadIgnorePatterns,
  normalizeCliTokenSources,
  normalizeConfigTokenSources,
  parseBooleanOption,
  resolveIgnorePatterns,
};
