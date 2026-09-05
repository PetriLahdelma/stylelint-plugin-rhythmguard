'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { parseLengthToken, toPx } = require('./length');
const { buildEffectiveTokenMap } = require('./token-map');
const { parseTokenSources } = require('./token-sources');
const { getScalePreset } = require('../presets/scales');

// Matches the audit default so lint and audit agree on what a spacing token is.
const DEFAULT_AUTO_TOKEN_PATTERN = '(^--|-)(?<!letter-)(?<!word-)(space|spacing)(-|$)';
// Tailwind v4 defines one base (`--spacing: 0.25rem`) and derives utilities by multiplying it.
const TAILWIND_BASE_TOKENS = new Set(['--spacing', '--space']);
const TAILWIND_SPACING_MULTIPLIERS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];
const FALLBACK_PRESET = 'rhythmic-4';
// Zero plus at least three distinct token values; a one- or two-token scale is worse than the default.
const MIN_INFERRED_SCALE_LENGTH = 4;
const RC_FILE = '.rhythmguardrc.json';

const sourceCache = new Map();

function pxValuesFromKeys(keys, baseFontSize) {
  const values = new Set([0]);

  for (const key of keys) {
    const parsed = parseLengthToken(String(key));
    if (!parsed) {
      continue;
    }

    const px = toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize);
    if (px !== null && Number.isFinite(px)) {
      values.add(px);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function normalizeSource(source, baseDir) {
  if (typeof source === 'string') {
    return { format: 'auto', path: path.resolve(baseDir, source) };
  }

  if (source && typeof source === 'object') {
    const rawPath = source.path || source.file;
    if (typeof rawPath !== 'string') {
      return null;
    }

    return {
      format: typeof source.format === 'string' ? source.format : 'auto',
      path: path.resolve(source.baseDir || baseDir, rawPath),
    };
  }

  return null;
}

function cacheKey(sources) {
  return sources
    .map((source) => {
      let mtime = 'missing';
      try {
        mtime = String(fs.statSync(source.path).mtimeMs);
      } catch {
        // missing file: key still changes when it appears
      }
      return `${source.path}|${source.format}|${mtime}`;
    })
    .join('\n');
}

function scaleFromSources(sources, baseFontSize) {
  const normalized = sources.map((source) => normalizeSource(source, process.cwd())).filter(Boolean);
  if (normalized.length === 0) {
    return null;
  }

  const key = `${baseFontSize}\n${cacheKey(normalized)}`;
  if (sourceCache.has(key)) {
    return sourceCache.get(key);
  }

  const parsed = parseTokenSources({ baseFontSize, sources: normalized, tokenKind: 'spacing' });
  const keys = [];
  for (const definition of parsed.definitions.values()) {
    keys.push(...definition.normalizedValues);
  }

  const scale = pxValuesFromKeys(keys, baseFontSize);
  const outcome = scale.length >= MIN_INFERRED_SCALE_LENGTH
    ? {
      files: parsed.sources.map((source) => source.file),
      scale,
      tokenCount: parsed.definitions.size,
      warnings: parsed.warnings,
    }
    : null;

  sourceCache.set(key, outcome);
  return outcome;
}

/** Build a px scale from token definitions as produced by token-sources.js / contract.js. */
function scaleFromDefinitions(definitions, baseFontSize = 16) {
  const keys = [];
  const baseKeys = [];
  for (const definition of definitions.values()) {
    if (TAILWIND_BASE_TOKENS.has(definition.token)) {
      baseKeys.push(...definition.normalizedValues);
      continue;
    }
    keys.push(...definition.normalizedValues);
  }
  const scale = expandTailwindBase(pxValuesFromKeys(keys, baseFontSize), baseKeys, baseFontSize);
  return scale.length >= MIN_INFERRED_SCALE_LENGTH ? scale : null;
}

/** Merge Tailwind-style base multiples into a scale when a bare --spacing/--space base is defined. */
function expandTailwindBase(scale, baseKeys, baseFontSize) {
  const bases = pxValuesFromKeys(baseKeys, baseFontSize).filter((value) => value > 0);
  if (bases.length === 0) {
    return scale;
  }
  const values = new Set(scale);
  for (const base of bases) {
    for (const multiplier of TAILWIND_SPACING_MULTIPLIERS) {
      values.add(Math.round(base * multiplier * 1000) / 1000);
    }
  }
  return Array.from(values).sort((a, b) => a - b);
}

function rcTokenSources(cwd) {
  const rcPath = path.join(cwd, RC_FILE);
  if (!fs.existsSync(rcPath)) {
    return [];
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  } catch {
    return [];
  }

  const audit = config && typeof config === 'object' ? config.audit : null;
  const sources = audit && Array.isArray(audit.tokenSources) ? audit.tokenSources : [];
  const baseDir = path.dirname(rcPath);

  return sources
    .map((source) => normalizeSource(source, baseDir))
    .filter(Boolean);
}

function scaleFromTokenMap(map, baseFontSize) {
  const keys = [];
  const baseKeys = [];
  for (const [key, reference] of Object.entries(map)) {
    const name = String(reference).match(/^var\((--[\w-]+)\)$/);
    if (name && TAILWIND_BASE_TOKENS.has(name[1])) {
      baseKeys.push(key);
    } else {
      keys.push(key);
    }
  }
  const scale = expandTailwindBase(pxValuesFromKeys(keys, baseFontSize), baseKeys, baseFontSize);
  return scale.length >= MIN_INFERRED_SCALE_LENGTH ? scale : null;
}

/**
 * Resolve `scale: "auto"`. First matching source wins; sources are not merged so
 * the provenance is a single file list or the stylesheet.
 */
function resolveAutoScale({
  baseFontSize = 16,
  root,
  scaleSources = [],
  tailwindConfigPath = null,
  tokenPattern = DEFAULT_AUTO_TOKEN_PATTERN,
} = {}) {
  const fromOption = scaleFromSources(scaleSources, baseFontSize);
  if (fromOption) {
    return { source: 'scaleSources', ...fromOption };
  }

  const fromRc = scaleFromSources(rcTokenSources(process.cwd()), baseFontSize);
  if (fromRc) {
    return { source: 'rhythmguardrc', ...fromRc };
  }

  let tokenRegex;
  try {
    tokenRegex = new RegExp(tokenPattern);
  } catch {
    tokenRegex = new RegExp(DEFAULT_AUTO_TOKEN_PATTERN);
  }

  if (root) {
    const stylesheetMap = buildEffectiveTokenMap({
      options: { baseFontSize, tokenMap: {}, tokenMapFromCssCustomProperties: true },
      root,
      tokenRegex,
    });
    const scale = scaleFromTokenMap(stylesheetMap, baseFontSize);
    if (scale) {
      return { files: [], scale, source: 'stylesheet', tokenCount: scale.length - 1, warnings: [] };
    }
  }

  if (tailwindConfigPath) {
    const tailwindMap = buildEffectiveTokenMap({
      options: {
        baseFontSize,
        tailwindConfigPath,
        tokenMap: {},
        tokenMapFromTailwindSpacing: true,
      },
      root,
      tokenRegex,
    });
    const scale = scaleFromTokenMap(tailwindMap, baseFontSize);
    if (scale) {
      return { files: [tailwindConfigPath], scale, source: 'tailwind', tokenCount: scale.length - 1, warnings: [] };
    }
  }

  return {
    files: [],
    preset: FALLBACK_PRESET,
    scale: getScalePreset(FALLBACK_PRESET),
    source: 'fallback',
    tokenCount: 0,
    warnings: [],
  };
}

function autoScaleFallbackNote(inference) {
  if (!inference || inference.source !== 'fallback') {
    return '';
  }

  return `No spacing tokens were found for scale "auto"; using preset "${inference.preset}".`;
}

module.exports = {
  DEFAULT_AUTO_TOKEN_PATTERN,
  autoScaleFallbackNote,
  resolveAutoScale,
  scaleFromDefinitions,
};
