'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeTokenKind,
  normalizeTokenSourceFormat,
} = require('../utils/token-sources');
const {
  parseBaseFontSize,
  parseNonNegativeInteger,
  parsePathOption,
  parsePercentage,
  parsePositiveInteger,
  parseScale,
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
    config = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid Rhythmguard config ${parsed.configPath}: ${err.message}`);
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
  applyConfigScalar(next, audit, cliOptions, 'scale', 'scale', (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    return parseScale(String(value));
  });

  delete next.cliOptions;
  return next;
}

function applyConfigScalar(target, audit, cliOptions, targetKey, configKey, parser) {
  if (cliOptions.has(targetKey) || audit[configKey] === undefined) {
    return;
  }

  target[targetKey] = parser(audit[configKey], configKey);
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

  return sources.map((source) => {
    if (typeof source === 'string') {
      return {
        baseDir,
        format: 'auto',
        path: source,
      };
    }

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('Invalid Rhythmguard config: audit.tokenSources entries must be strings or objects.');
    }

    if (typeof source.path !== 'string' || source.path.trim().length === 0) {
      throw new Error('Invalid Rhythmguard config: token source objects must include a path.');
    }

    return {
      baseDir,
      format: normalizeTokenSourceFormat(source.format || 'auto'),
      path: source.path,
    };
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

module.exports = {
  applyAuditConfig,
  applyConfigScalar,
  loadAuditConfig,
  loadIgnorePatterns,
  normalizeCliTokenSources,
  normalizeConfigTokenSources,
  parseBooleanOption,
};
