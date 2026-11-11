'use strict';

const { readJsonFile } = require('./json');
const { conditionsOfNode, parseTokenValueLength, scopeOfNode } = require('./token-sources');

const fs = require('node:fs');
const path = require('node:path');
const {
  formatLength,
  parseLengthToken,
  toPx,
} = require('./length');

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeTokenReference(tokenReference) {
  if (typeof tokenReference !== 'string') {
    return null;
  }

  const trimmed = tokenReference.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(var\(|theme\(|token\(|\$|@)/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('--')) {
    return `var(${trimmed})`;
  }

  return `var(--${trimmed})`;
}

/**
 * Where a token came from, for messages: the path relative to the working
 * directory when it is inside it, the absolute path otherwise.
 */
function displayOrigin(file) {
  if (!file) {
    return null;
  }
  const relative = path.relative(process.cwd(), file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

/**
 * The tokens one map source offers for each key, before they reach the map.
 * A key collects the tokens whose value is written that way (`exact`) apart
 * from the tokens that only convert to it (`converted`: a 1rem token under the
 * 16px key), so a token in the literal's own unit is preferred, as the token
 * index does.
 */
function createCollector() {
  return new Map();
}

function collect(collector, key, token, exact) {
  if (!collector.has(key)) {
    collector.set(key, { converted: new Set(), exact: new Set(), last: token });
  }
  const entry = collector.get(key);
  (exact ? entry.exact : entry.converted).add(token);
  entry.last = token;
}

function addLengthValueMapping(collector, rawLength, tokenReference, baseFontSize, origins = null, origin = null) {
  if (typeof rawLength !== 'string') {
    return;
  }

  const parsed = parseTokenValueLength(rawLength);
  if (!parsed) {
    return;
  }

  const token = normalizeTokenReference(tokenReference);
  if (!token) {
    return;
  }

  if (origins && origin && !origins[token]) {
    origins[token] = origin;
  }

  // Keyed by the signed value: a -8px token stands for -8px, never for 8px
  // (issue #221). prefer-token negates a positive token for a negative literal.
  const normalizedRaw = formatLength(parsed.number, parsed.unit || 'px');
  collect(collector, normalizedRaw, token, true);

  const px = toPx(parsed.number, parsed.unit, baseFontSize);
  if (px !== null) {
    const pxKey = `${px}px`;
    collect(collector, pxKey, token, pxKey === normalizedRaw);
  }
}

/**
 * The tokens a collected key stands for: the ones written in its unit when
 * there are any, the converted ones otherwise. Sorted, so messages are stable.
 */
function candidatesOf(entry) {
  const chosen = entry.exact.size > 0 ? entry.exact : entry.converted;
  return [...chosen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Write one source's keys into the map. A key one token holds maps to that
 * token. A key several tokens hold is a guess either way, so it is recorded
 * in `ambiguous` with every candidate and no fix writes it (fix-06); the map
 * keeps a token under the key only so the set of keys (which scale inference
 * reads) is unchanged. A later source replaces an earlier one key by key.
 * `accept` may skip a key entirely, leaving earlier sources in charge of it.
 */
function applyCollector(map, ambiguous, collector, accept = () => true) {
  for (const [key, entry] of collector) {
    const candidates = candidatesOf(entry);
    if (!accept(candidates)) {
      continue;
    }
    if (candidates.length === 1) {
      map[key] = candidates[0];
      delete ambiguous[key];
    } else {
      map[key] = entry.last;
      ambiguous[key] = candidates;
    }
  }
}

function mergeExplicitTokenMap(target, source, ambiguous = {}) {
  if (!isPlainObject(source)) {
    return target;
  }

  for (const [raw, tokenReference] of Object.entries(source)) {
    if (typeof tokenReference !== 'string') {
      continue;
    }

    target[raw] = tokenReference;
    delete ambiguous[raw];
  }

  return target;
}

function walkTokenGroup(collector, group, prefix, baseFontSize, origins, origin) {
  for (const [key, value] of Object.entries(group)) {
    const tokenName = `${prefix}-${key}`;

    if (!isPlainObject(value)) {
      continue;
    }

    // Leaf node with $value (DTCG)
    if (typeof value.$value === 'string') {
      addLengthValueMapping(collector, value.$value, tokenName, baseFontSize, origins, origin);
      continue;
    }

    // Leaf node with value (Style Dictionary)
    if (typeof value.value === 'string') {
      addLengthValueMapping(collector, value.value, tokenName, baseFontSize, origins, origin);
      continue;
    }

    // Nested group: recurse deeper
    walkTokenGroup(collector, value, tokenName, baseFontSize, origins, origin);
  }
}

function mergeTokenMapFromFile({
  ambiguous = {},
  baseFontSize,
  currentMap,
  origins = null,
  tokenMapFile,
}) {
  if (!tokenMapFile) {
    return currentMap;
  }

  const resolvedPath = path.resolve(process.cwd(), tokenMapFile);
  if (!fs.existsSync(resolvedPath)) {
    return currentMap;
  }

  let parsed;
  try {
    parsed = readJsonFile(resolvedPath);
  } catch {
    return currentMap;
  }

  if (!isPlainObject(parsed)) {
    return currentMap;
  }

  const nextMap = {
    ...currentMap,
  };
  const collector = createCollector();
  const origin = displayOrigin(resolvedPath);

  for (const [entryKey, entryValue] of Object.entries(parsed)) {
    if (typeof entryValue === 'string') {
      const keyAsLength = parseLengthToken(entryKey);
      const valueAsLength = parseLengthToken(entryValue);

      if (keyAsLength) {
        collect(collector, entryKey, entryValue, true);
        if (origins && !origins[entryValue]) {
          origins[entryValue] = origin;
        }
        continue;
      }

      if (valueAsLength) {
        addLengthValueMapping(collector, entryValue, entryKey, baseFontSize, origins, origin);
      }

      continue;
    }

    if (typeof entryValue === 'number') {
      addLengthValueMapping(collector, `${entryValue}px`, entryKey, baseFontSize, origins, origin);
      continue;
    }

    if (isPlainObject(entryValue)) {
      // Style Dictionary format: { value: "16px" }
      if (typeof entryValue.value === 'string') {
        addLengthValueMapping(collector, entryValue.value, entryKey, baseFontSize, origins, origin);
        continue;
      }

      // W3C DTCG format: { $value: "16px", $type: "dimension" }
      if (typeof entryValue.$value === 'string') {
        addLengthValueMapping(collector, entryValue.$value, entryKey, baseFontSize, origins, origin);
        continue;
      }

      // Nested group: recurse (e.g. { spacing: { 4: { $value: "16px" } } })
      walkTokenGroup(collector, entryValue, entryKey, baseFontSize, origins, origin);
    }
  }

  applyCollector(nextMap, ambiguous, collector);
  return nextMap;
}

/**
 * Whether a custom property declaration is defined everywhere: at the root
 * (`:root`, `html`, `@theme`) and outside every `@media`, `@supports` and
 * `@container` block.
 */
function declaredEverywhere(decl) {
  return scopeOfNode(decl) === 'root' && conditionsOfNode(decl).length === 0;
}

function mergeTokenMapFromCssCustomProperties({
  baseFontSize,
  currentMap,
  origins = null,
  root,
  tokenRegex,
}) {
  const nextMap = {
    ...currentMap,
  };
  const origin = displayOrigin(root && root.source && root.source.input ? root.source.input.file : null);

  // Every value each custom property is given in the file. A property given
  // two values (at the root and under a media query, a theme or a data
  // attribute) renders differently there, so no fix writes it (issue #231).
  const valuesByProp = new Map();
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!prop.startsWith('--') || !tokenRegex.test(prop)) {
      return;
    }
    const parsed = parseTokenValueLength(decl.value);
    const px = parsed ? toPx(parsed.number, parsed.unit, baseFontSize) : null;
    const key = px === null ? `raw:${decl.value.trim()}` : `px:${formatLength(px, 'px')}`;
    if (!valuesByProp.has(decl.prop)) {
      valuesByProp.set(decl.prop, { decl, everywhere: false, keys: new Set() });
    }
    const entry = valuesByProp.get(decl.prop);
    entry.keys.add(key);
    entry.everywhere = entry.everywhere || declaredEverywhere(decl);
  });

  const collector = createCollector();
  const everywhere = new Set();
  for (const entry of valuesByProp.values()) {
    if (entry.keys.size > 1) {
      continue;
    }

    const parsed = parseTokenValueLength(entry.decl.value);
    if (!parsed || parsed.number === 0) {
      continue;
    }

    const token = `var(${entry.decl.prop})`;
    if (entry.everywhere) {
      everywhere.add(token);
    }
    addLengthValueMapping(collector, entry.decl.value, token, baseFontSize, origins, origin);
  }

  // A value two tokens hold, or one held by a token that is not defined
  // everywhere (a `.card` token, a token under `@media`), is left out of the
  // map. prefer-token's token index then names every candidate defined where
  // the value sits and writes one only when it is the only one (css-08,
  // fix-02).
  applyCollector(nextMap, {}, collector, (candidates) => candidates.length === 1 && everywhere.has(candidates[0]));

  return nextMap;
}

const tailwindSpacingCache = new Map();

function extractTailwindSpacing(config) {
  if (!isPlainObject(config)) {
    return null;
  }

  const theme = isPlainObject(config.theme)
    ? config.theme
    : null;
  if (!theme) {
    return null;
  }

  const spacing = isPlainObject(theme.spacing)
    ? theme.spacing
    : {};
  const extendSpacing =
    isPlainObject(theme.extend) && isPlainObject(theme.extend.spacing)
      ? theme.extend.spacing
      : {};

  return {
    ...spacing,
    ...extendSpacing,
  };
}

function loadTailwindSpacingFromRequire(resolvedPath) {
  try {
    const loaded = require(resolvedPath);
    const config = loaded && typeof loaded.default === 'object'
      ? loaded.default
      : loaded;

    return extractTailwindSpacing(config);
  } catch {
    return null;
  }
}

function loadTailwindSpacing(resolvedPath) {
  if (tailwindSpacingCache.has(resolvedPath)) {
    return tailwindSpacingCache.get(resolvedPath);
  }

  // require() loads CommonJS and ES module configs alike on every supported Node
  // (require(esm) is on from 20.19). A config that uses top-level await cannot be
  // required and is not read; point scaleSources at the built CSS instead.
  const spacing = loadTailwindSpacingFromRequire(resolvedPath);

  tailwindSpacingCache.set(resolvedPath, spacing);
  return spacing;
}

function mergeTokenMapFromTailwindSpacing({
  ambiguous = {},
  currentMap,
  origins = null,
  tailwindConfigPath,
}) {
  if (!tailwindConfigPath) {
    return currentMap;
  }

  const resolvedPath = path.resolve(process.cwd(), tailwindConfigPath);
  if (!fs.existsSync(resolvedPath)) {
    return currentMap;
  }

  const spacing = loadTailwindSpacing(resolvedPath);
  if (!isPlainObject(spacing) || Object.keys(spacing).length === 0) {
    return currentMap;
  }

  const nextMap = {
    ...currentMap,
  };
  const collector = createCollector();

  for (const [key, value] of Object.entries(spacing)) {
    if (typeof value !== 'string') {
      continue;
    }

    const parsed = parseLengthToken(value);
    if (!parsed || parsed.number === 0) {
      continue;
    }

    const normalizedRaw = formatLength(parsed.number, parsed.unit || 'px');
    const token = `theme(spacing.${key})`;
    collect(collector, normalizedRaw, token, true);
    if (origins && !origins[token]) {
      origins[token] = displayOrigin(resolvedPath);
    }
  }

  applyCollector(nextMap, ambiguous, collector);
  return nextMap;
}

/**
 * The raw-length to token-reference map a rule fixes with. Pass `origins` to
 * also learn where each token reference came from (the token map file, the
 * stylesheet, the Tailwind config), keyed by the reference; an explicit
 * `tokenMap` entry has no origin. Pass `ambiguous` to learn the keys several
 * tokens of one source hold, each with its candidates: those keys are never a
 * fix (fix-06).
 */
function buildEffectiveTokenMap({
  ambiguous = {},
  options,
  origins = null,
  root,
  tokenRegex,
}) {
  let tokenMap = {};

  if (options.tokenMapFile) {
    tokenMap = mergeTokenMapFromFile({
      ambiguous,
      baseFontSize: options.baseFontSize,
      currentMap: tokenMap,
      origins,
      tokenMapFile: options.tokenMapFile,
    });
  }

  if (options.tokenMapFromCssCustomProperties) {
    tokenMap = mergeTokenMapFromCssCustomProperties({
      baseFontSize: options.baseFontSize,
      currentMap: tokenMap,
      origins,
      root,
      tokenRegex,
    });
  }

  if (options.tokenMapFromTailwindSpacing && options.tailwindConfigPath) {
    tokenMap = mergeTokenMapFromTailwindSpacing({
      ambiguous,
      currentMap: tokenMap,
      origins,
      tailwindConfigPath: options.tailwindConfigPath,
    });
  }

  // Explicit tokenMap applied last so it takes precedence over auto-derived tokens
  tokenMap = mergeExplicitTokenMap(tokenMap, options.tokenMap, ambiguous);

  return tokenMap;
}

module.exports = {
  buildEffectiveTokenMap,
};
