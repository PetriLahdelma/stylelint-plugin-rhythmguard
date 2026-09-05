'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  formatLength,
  parseLengthToken,
  toPx,
} = require('./length');

const VALID_TOKEN_SOURCE_FORMATS = new Set([
  'auto',
  'css',
  'flat-json',
  'style-dictionary',
  'dtcg',
]);

const VALID_TOKEN_KINDS = new Set([
  'spacing',
  'radius',
  'typography',
  'size',
  'motion',
  'all',
]);

const TOKEN_KIND_PATTERNS = Object.freeze({
  all: /^--/,
  radius: /^--radius-/,
  motion: /^--(?:motion|duration|delay|ease|easing)-/,
  size: /^--(?:size|width|height|container)-/,
  // Anchored or prefixed (--spacing-4, --lb-spacing-md, bare Tailwind v4 --spacing), never letter-/word-spacing.
  spacing: /(?:^--|-)(?<!letter-)(?<!word-)(?:space|spacing)(?:-|$)/,
  typography: /^--(?:font|font-size|line-height|leading|tracking|typography)-/,
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeTokenSourceFormat(format) {
  const normalized = String(format || 'auto').trim().toLowerCase();
  if (!VALID_TOKEN_SOURCE_FORMATS.has(normalized)) {
    throw new Error(`Invalid token source format "${format}". Expected auto, css, flat-json, style-dictionary, or dtcg.`);
  }

  return normalized;
}

function normalizeTokenKind(kind) {
  const normalized = String(kind || 'spacing').trim().toLowerCase();
  if (!VALID_TOKEN_KINDS.has(normalized)) {
    throw new Error(`Invalid token kind "${kind}". Expected spacing, radius, typography, size, motion, or all.`);
  }

  return normalized;
}

function createTokenKindMatcher(kind) {
  const normalizedKind = normalizeTokenKind(kind);
  const pattern = TOKEN_KIND_PATTERNS[normalizedKind] || TOKEN_KIND_PATTERNS.spacing;

  return (token) => pattern.test(token);
}

function parseTokenSources({
  baseFontSize = 16,
  sources = [],
  tokenKind = 'spacing',
} = {}) {
  const definitions = new Map();
  const sourceReports = [];
  const warnings = [];
  const matchesKind = createTokenKindMatcher(tokenKind);

  for (const source of sources) {
    const normalizedSource = normalizeTokenSource(source);
    const sourceReport = {
      file: formatPath(normalizedSource.resolvedPath),
      format: normalizedSource.format,
      requestedFormat: normalizedSource.requestedFormat,
      tokenCount: 0,
      warnings: [],
    };

    if (!fs.existsSync(normalizedSource.resolvedPath)) {
      const warning = `Token source not found: ${normalizedSource.displayPath}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    let text;
    try {
      text = fs.readFileSync(normalizedSource.resolvedPath, 'utf8');
    } catch (err) {
      const warning = `Unable to read token source ${normalizedSource.displayPath}: ${err.message}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    let tokens = [];
    try {
      if (normalizedSource.format === 'css') {
        tokens = collectCssTokens(text, matchesKind);
      } else {
        const parsed = JSON.parse(text);
        const detectedFormat = normalizedSource.requestedFormat === 'auto'
          ? detectJsonTokenFormat(parsed)
          : normalizedSource.format;
        sourceReport.format = detectedFormat;
        tokens = collectJsonTokens(parsed, matchesKind);
      }
    } catch (err) {
      const warning = `Unable to parse token source ${normalizedSource.displayPath}: ${err.message}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    for (const token of tokens) {
      addDefinition(definitions, {
        baseFontSize,
        file: sourceReport.file,
        source: sourceReport.file,
        token: token.token,
        value: token.value,
      });
    }

    sourceReport.tokenCount = tokens.length;
    sourceReports.push(sourceReport);
  }

  return {
    definitions,
    sources: sourceReports,
    warnings,
  };
}

function normalizeTokenSource(source) {
  if (!isPlainObject(source)) {
    throw new Error('Token source entries must be strings or objects with a path.');
  }

  const sourcePath = source.path || source.file;
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw new Error('Token source entries must include a non-empty path.');
  }

  const baseDir = source.baseDir || process.cwd();
  const requestedFormat = normalizeTokenSourceFormat(source.format || 'auto');
  const resolvedPath = path.resolve(baseDir, sourcePath);

  return {
    displayPath: sourcePath,
    format: requestedFormat === 'auto' ? detectSourceFormat(resolvedPath) : requestedFormat,
    requestedFormat,
    resolvedPath,
  };
}

function detectSourceFormat(filePath) {
  if (path.extname(filePath).toLowerCase() === '.css') {
    return 'css';
  }

  return 'flat-json';
}

function detectJsonTokenFormat(parsed) {
  let hasDtcg = false;
  let hasStyleDictionary = false;

  function walk(value) {
    if (!isPlainObject(value)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(value, '$value')) {
      hasDtcg = true;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      hasStyleDictionary = true;
    }

    for (const child of Object.values(value)) {
      walk(child);
    }
  }

  walk(parsed);

  if (hasDtcg) {
    return 'dtcg';
  }

  if (hasStyleDictionary) {
    return 'style-dictionary';
  }

  return 'flat-json';
}

function collectCssTokens(source, matchesKind) {
  const tokens = [];
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let match;

  while ((match = declarationPattern.exec(source)) !== null) {
    const token = match[1];
    if (!matchesKind(token)) {
      continue;
    }

    tokens.push({
      token,
      value: match[2].trim(),
    });
  }

  return tokens;
}

function collectJsonTokens(parsed, matchesKind) {
  if (!isPlainObject(parsed)) {
    return [];
  }

  const tokens = [];
  walkJsonTokenGroup(parsed, [], tokens, matchesKind);
  return tokens;
}

function walkJsonTokenGroup(group, segments, tokens, matchesKind) {
  for (const [key, value] of Object.entries(group)) {
    if (isMetadataKey(key)) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const tokenEntry = tokenFromPrimitive(key, value, segments);
      if (tokenEntry && matchesKind(tokenEntry.token)) {
        tokens.push(tokenEntry);
      }
      continue;
    }

    if (!isPlainObject(value)) {
      continue;
    }

    const leafValue = leafTokenValue(value);
    if (leafValue !== null) {
      const token = key.startsWith('--')
        ? key
        : toCustomProperty([...segments, key]);
      if (matchesKind(token)) {
        tokens.push({
          token,
          value: leafValue,
        });
      }
      continue;
    }

    walkJsonTokenGroup(value, [...segments, key], tokens, matchesKind);
  }
}

function tokenFromPrimitive(key, value, segments) {
  if (key.startsWith('--')) {
    return {
      token: key,
      value: String(value),
    };
  }

  const keyAsLength = parseLengthToken(key);
  const tokenName = typeof value === 'string' ? extractTokenName(value) : null;
  if (keyAsLength && tokenName) {
    return {
      token: tokenName,
      value: key,
    };
  }

  const valueAsLength = typeof value === 'string'
    ? parseLengthToken(value)
    : typeof value === 'number'
      ? parseLengthToken(`${value}px`)
      : null;
  if (valueAsLength) {
    return {
      token: toCustomProperty([...segments, key]),
      value: typeof value === 'number' ? `${value}px` : value,
    };
  }

  return null;
}

function leafTokenValue(value) {
  if (typeof value.$value === 'string' || typeof value.$value === 'number') {
    return String(value.$value);
  }

  if (typeof value.value === 'string' || typeof value.value === 'number') {
    return String(value.value);
  }

  return null;
}

function isMetadataKey(key) {
  return key.startsWith('$')
    || key === 'type'
    || key === 'description'
    || key === 'comment'
    || key === 'attributes';
}

function toCustomProperty(segments) {
  return `--${segments
    .map((segment) => String(segment).trim())
    .filter(Boolean)
    .join('-')}`;
}

function extractTokenName(value) {
  const varMatch = value.match(/var\(\s*(--[\w-]+)/);
  if (varMatch) {
    return varMatch[1];
  }

  if (value.startsWith('--')) {
    return value;
  }

  return null;
}

function addDefinition(definitions, {
  baseFontSize,
  file,
  source,
  token,
  value,
}) {
  const entry = definitions.get(token) || {
    files: new Set(),
    normalizedValues: new Set(),
    sources: new Set(),
    token,
    values: new Set(),
  };

  entry.files.add(file);
  entry.sources.add(source);
  entry.values.add(String(value).trim());

  for (const normalizedValue of getNormalizedValueKeys(value, baseFontSize)) {
    entry.normalizedValues.add(normalizedValue);
  }

  definitions.set(token, entry);
}

const CALC_LENGTH_TIMES_VAR = /^calc\(\s*(-?[\d.]+(?:px|rem|em)?)\s*\*\s*var\([^()]*\)\s*\)$/i;
const CALC_VAR_TIMES_LENGTH = /^calc\(\s*var\([^()]*\)\s*\*\s*(-?[\d.]+(?:px|rem|em)?)\s*\)$/i;

/**
 * Parse the length a token value carries. Accepts plain lengths and the
 * `calc(<length> * var(--factor))` form design systems use for scaling
 * (Radix Themes: `--space-1: calc(4px * var(--scaling))`).
 */
function parseTokenValueLength(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const direct = parseLengthToken(trimmed);
  if (direct) {
    return direct;
  }

  const match = trimmed.match(CALC_LENGTH_TIMES_VAR) || trimmed.match(CALC_VAR_TIMES_LENGTH);
  if (!match) {
    return null;
  }

  const inner = parseLengthToken(match[1]);
  return inner ? { ...inner, raw: trimmed } : null;
}

function getNormalizedValueKeys(value, baseFontSize = 16) {
  if (value === null || value === undefined) {
    return [];
  }

  const raw = String(value).trim();
  if (!raw) {
    return [];
  }

  const keys = new Set([raw]);
  const parsed = parseTokenValueLength(raw);
  if (!parsed) {
    return Array.from(keys);
  }

  const absolute = Math.abs(parsed.number);
  keys.add(formatLength(absolute, parsed.unit || 'px'));

  const px = toPx(absolute, parsed.unit, baseFontSize);
  if (px !== null) {
    keys.add(`${px}px`);
  }

  return Array.from(keys);
}

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

module.exports = {
  VALID_TOKEN_KINDS,
  VALID_TOKEN_SOURCE_FORMATS,
  addDefinition,
  createTokenKindMatcher,
  getNormalizedValueKeys,
  normalizeTokenKind,
  normalizeTokenSourceFormat,
  parseTokenSources,
  parseTokenValueLength,
};
