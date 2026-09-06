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
  // CSS custom properties (--spacing-4, --lb-spacing-md, bare --spacing) and Sass
  // variables or map entries ($spacer, $spacers.3, $system-spacing.small.2).
  // Custom properties may carry a namespace (--lb-spacing-md, --mantine-spacing-xs, bare
  // --spacing) but never letter-/word-spacing. Sass names must start with the scale word
  // (an optional `system-` prefix allowed): $spacer, $spacers.3, $spacing-01, $system-spacing.
  // Component variables such as $dropdown-spacer or $card-spacer-y are not scale tokens.
  spacing: /^(?:\$(?:system-)?(?:space|spacing|spacer)s?(?:-|$|\.)|--(?:[\w-]*-)?(?<!letter-)(?<!word-)(?:space|spacing|spacer)(?:-|$))/,
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

function createPatternMatcher(pattern, fallback) {
  try {
    const regex = new RegExp(pattern);
    return (token) => regex.test(token);
  } catch {
    return fallback;
  }
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
    const matchesSource = normalizedSource.tokenPattern
      ? createPatternMatcher(normalizedSource.tokenPattern, matchesKind)
      : matchesKind;
    try {
      if (normalizedSource.format === 'css') {
        tokens = collectCssTokens(text, matchesSource);
      } else {
        const parsed = JSON.parse(text);
        const detectedFormat = normalizedSource.requestedFormat === 'auto'
          ? detectJsonTokenFormat(parsed)
          : normalizedSource.format;
        sourceReport.format = detectedFormat;
        tokens = collectJsonTokens(parsed, matchesSource);
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
    // Optional per-source override for packages that name spacing tokens differently
    // (Primer's --base-size-*). Falls back to the kind matcher when absent.
    tokenPattern: typeof source.tokenPattern === 'string' && source.tokenPattern ? source.tokenPattern : null,
  };
}

function detectSourceFormat(filePath) {
  // .scss token files are read by the CSS collector too: custom properties plus Sass variables and maps.
  if (['.css', '.scss'].includes(path.extname(filePath).toLowerCase())) {
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

  tokens.push(...collectScssTokens(source, matchesKind));
  return tokens;
}

/**
 * Sass variables and maps as token sources. Handles `$spacer: 1rem`, maps such
 * as `$spacers: (1: $spacer * .25, ...)` including nested maps, variable
 * references, `* / + -` arithmetic and `math.div()`. Anything it cannot
 * evaluate (function calls, strings, keywords, interpolated keys, cycles) is
 * skipped rather than guessed. Token names are `$name` or `$name.key.path`.
 */
function collectScssTokens(source, matchesKind) {
  const declarations = parseScssDeclarations(source);
  const cache = new Map();

  const resolveVariable = (name, stack) => {
    if (cache.has(name)) {
      return cache.get(name);
    }
    if (stack.has(name) || !declarations.has(name)) {
      return null;
    }
    stack.add(name);
    const raw = declarations.get(name);
    const value = isScssMap(raw) ? null : evaluateScssExpression(raw, resolveVariable, stack);
    stack.delete(name);
    cache.set(name, value);
    return value;
  };

  const tokens = [];
  const push = (tokenName, value) => {
    if (!value || !matchesKind(tokenName)) {
      return;
    }
    tokens.push({ token: tokenName, value: formatScssValue(value) });
  };

  for (const [name, raw] of declarations) {
    const tokenName = `$${name}`;
    if (isScssMap(raw)) {
      walkScssMap(raw, [tokenName], (pathName, expression) => {
        push(pathName, evaluateScssExpression(expression, resolveVariable, new Set()));
      });
      continue;
    }
    push(tokenName, resolveVariable(name, new Set()));
  }

  return tokens;
}

function stripScssComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function parseScssDeclarations(source) {
  const text = stripScssComments(source);
  const declarations = new Map();
  const startPattern = /(?:^|\n)[ \t]*\$([\w-]+)[ \t]*:/g;
  let match;

  while ((match = startPattern.exec(text)) !== null) {
    const name = match[1];
    let index = match.index + match[0].length;
    let depth = 0;
    let quote = null;
    let value = '';

    for (; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        value += char;
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      } else if (char === ';' && depth === 0) {
        break;
      }
      value += char;
    }

    startPattern.lastIndex = index;
    const cleaned = value.replace(/!(default|global)\b/g, '').trim();
    if (cleaned && !declarations.has(name)) {
      declarations.set(name, cleaned);
    }
  }

  return declarations;
}

function isScssMap(raw) {
  return raw.startsWith('(') && raw.endsWith(')') && /:/.test(raw);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function walkScssMap(raw, pathSegments, visit) {
  const inner = raw.slice(1, -1);
  for (const entry of splitTopLevel(inner, ',')) {
    const pair = splitTopLevel(entry, ':');
    if (pair.length < 2) continue;
    const key = pair[0].trim().replace(/^["']|["']$/g, '');
    const expression = pair.slice(1).join(':').trim();
    if (!key || key.includes('#{')) continue;
    const nextPath = [...pathSegments, key];
    if (isScssMap(expression)) {
      walkScssMap(expression, nextPath, visit);
    } else {
      visit(nextPath.join('.'), expression);
    }
  }
}

const SCSS_TOKEN_PATTERN = /\s*(?:(-?(?:\d+\.?\d*|\.\d+)[a-zA-Z%]*)|(\$[\w-]+)|([a-zA-Z_][\w.-]*)\s*\(|([()*/+,-]))/y;

function tokenizeScssExpression(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    SCSS_TOKEN_PATTERN.lastIndex = index;
    const match = SCSS_TOKEN_PATTERN.exec(expression);
    if (!match) {
      if (/\s/.test(expression[index])) {
        index += 1;
        continue;
      }
      return null;
    }
    index = SCSS_TOKEN_PATTERN.lastIndex;
    if (match[1] !== undefined) tokens.push({ type: 'number', raw: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: 'var', name: match[2].slice(1) });
    else if (match[3] !== undefined) tokens.push({ type: 'call', name: match[3] });
    else tokens.push({ type: 'op', value: match[4] });
  }
  return tokens;
}

function evaluateScssExpression(expression, resolveVariable, stack) {
  const tokens = tokenizeScssExpression(expression.trim());
  if (!tokens || tokens.length === 0) {
    return null;
  }
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const parseNumber = (raw) => {
    const parsed = parseLengthToken(raw);
    if (parsed) return { number: parsed.number, unit: parsed.unit };
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? { number: numeric, unit: '' } : null;
  };

  const combine = (left, op, right) => {
    if (!left || !right) return null;
    if (op === '*') {
      if (left.unit && right.unit) return null;
      return { number: left.number * right.number, unit: left.unit || right.unit };
    }
    if (op === '/') {
      if (right.number === 0) return null;
      if (right.unit && right.unit !== left.unit) return null;
      return { number: left.number / right.number, unit: right.unit ? '' : left.unit };
    }
    const compatible = left.unit === right.unit || left.number === 0 || right.number === 0;
    if (!compatible) return null;
    return { number: op === '+' ? left.number + right.number : left.number - right.number, unit: left.unit || right.unit };
  };

  const parsePrimary = () => {
    const token = next();
    if (!token) return null;
    if (token.type === 'number') return parseNumber(token.raw);
    if (token.type === 'var') return resolveVariable(token.name, stack);
    if (token.type === 'op' && token.value === '-') {
      const value = parsePrimary();
      return value ? { number: -value.number, unit: value.unit } : null;
    }
    if (token.type === 'op' && token.value === '(') {
      const value = parseExpression();
      const closing = next();
      return closing && closing.type === 'op' && closing.value === ')' ? value : null;
    }
    if (token.type === 'call') {
      const args = [];
      let current = parseExpression();
      args.push(current);
      while (peek() && peek().type === 'op' && peek().value === ',') {
        next();
        args.push(parseExpression());
      }
      const closing = next();
      if (!closing || closing.type !== 'op' || closing.value !== ')') return null;
      if (token.name === 'math.div' && args.length === 2) return combine(args[0], '/', args[1]);
      return null;
    }
    return null;
  };

  const parseTerm = () => {
    let value = parsePrimary();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      value = combine(value, op, parsePrimary());
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      value = combine(value, op, parseTerm());
    }
    return value;
  };

  const result = parseExpression();
  return position === tokens.length ? result : null;
}

function formatScssValue(value) {
  const rounded = Math.round(value.number * 1000) / 1000;
  if (rounded === 0) return '0';
  return `${rounded}${value.unit}`;
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
  collectScssTokens,
  createTokenKindMatcher,
  getNormalizedValueKeys,
  normalizeTokenKind,
  normalizeTokenSourceFormat,
  parseTokenSources,
  parseTokenValueLength,
};
