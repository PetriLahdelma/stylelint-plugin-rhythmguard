'use strict';

const { parseTokenValueLength } = require('./token-sources');

const { spawnSync } = require('node:child_process');
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

function addLengthValueMapping(map, rawLength, tokenReference, baseFontSize, origins = null, origin = null) {
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

  const absolute = Math.abs(parsed.number);
  const normalizedRaw = formatLength(absolute, parsed.unit || 'px');
  map[normalizedRaw] = token;

  const px = toPx(absolute, parsed.unit, baseFontSize);
  if (px !== null) {
    map[`${px}px`] = token;
  }
}

function mergeExplicitTokenMap(target, source) {
  if (!isPlainObject(source)) {
    return target;
  }

  for (const [raw, tokenReference] of Object.entries(source)) {
    if (typeof tokenReference !== 'string') {
      continue;
    }

    target[raw] = tokenReference;
  }

  return target;
}

function walkTokenGroup(map, group, prefix, baseFontSize, origins, origin) {
  for (const [key, value] of Object.entries(group)) {
    const tokenName = `${prefix}-${key}`;

    if (!isPlainObject(value)) {
      continue;
    }

    // Leaf node with $value (DTCG)
    if (typeof value.$value === 'string') {
      addLengthValueMapping(map, value.$value, tokenName, baseFontSize, origins, origin);
      continue;
    }

    // Leaf node with value (Style Dictionary)
    if (typeof value.value === 'string') {
      addLengthValueMapping(map, value.value, tokenName, baseFontSize, origins, origin);
      continue;
    }

    // Nested group: recurse deeper
    walkTokenGroup(map, value, tokenName, baseFontSize, origins, origin);
  }
}

function mergeTokenMapFromFile({
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
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch {
    return currentMap;
  }

  if (!isPlainObject(parsed)) {
    return currentMap;
  }

  const nextMap = {
    ...currentMap,
  };
  const origin = displayOrigin(resolvedPath);

  for (const [entryKey, entryValue] of Object.entries(parsed)) {
    if (typeof entryValue === 'string') {
      const keyAsLength = parseLengthToken(entryKey);
      const valueAsLength = parseLengthToken(entryValue);

      if (keyAsLength) {
        nextMap[entryKey] = entryValue;
        if (origins && !origins[entryValue]) {
          origins[entryValue] = origin;
        }
        continue;
      }

      if (valueAsLength) {
        addLengthValueMapping(nextMap, entryValue, entryKey, baseFontSize, origins, origin);
      }

      continue;
    }

    if (typeof entryValue === 'number') {
      addLengthValueMapping(nextMap, `${entryValue}px`, entryKey, baseFontSize, origins, origin);
      continue;
    }

    if (isPlainObject(entryValue)) {
      // Style Dictionary format: { value: "16px" }
      if (typeof entryValue.value === 'string') {
        addLengthValueMapping(nextMap, entryValue.value, entryKey, baseFontSize, origins, origin);
        continue;
      }

      // W3C DTCG format: { $value: "16px", $type: "dimension" }
      if (typeof entryValue.$value === 'string') {
        addLengthValueMapping(nextMap, entryValue.$value, entryKey, baseFontSize, origins, origin);
        continue;
      }

      // Nested group: recurse (e.g. { spacing: { 4: { $value: "16px" } } })
      walkTokenGroup(nextMap, entryValue, entryKey, baseFontSize, origins, origin);
    }
  }

  return nextMap;
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

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!prop.startsWith('--')) {
      return;
    }

    if (!tokenRegex.test(prop)) {
      return;
    }

    const parsed = parseTokenValueLength(decl.value);
    if (!parsed || parsed.number === 0) {
      return;
    }

    addLengthValueMapping(nextMap, decl.value, `var(${decl.prop})`, baseFontSize, origins, origin);
  });

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

function loadTailwindSpacingFromDynamicImport(resolvedPath) {
  const script = [
    'const { pathToFileURL } = require("node:url");',
    '(async () => {',
    '  try {',
    '    const configPath = process.argv[1];',
    '    const loaded = await import(pathToFileURL(configPath).href);',
    '    const config = loaded && typeof loaded.default === "object" ? loaded.default : loaded;',
    '    if (!config || typeof config !== "object" || Array.isArray(config)) {',
    '      process.stdout.write("{}");',
    '      return;',
    '    }',
    '    const theme = config.theme && typeof config.theme === "object" && !Array.isArray(config.theme)',
    '      ? config.theme',
    '      : null;',
    '    if (!theme) {',
    '      process.stdout.write("{}");',
    '      return;',
    '    }',
    '    const spacing = theme.spacing && typeof theme.spacing === "object" && !Array.isArray(theme.spacing)',
    '      ? theme.spacing',
    '      : {};',
    '    const extendSpacing = theme.extend && typeof theme.extend === "object" && !Array.isArray(theme.extend) &&',
    '      theme.extend.spacing && typeof theme.extend.spacing === "object" && !Array.isArray(theme.extend.spacing)',
    '      ? theme.extend.spacing',
    '      : {};',
    '    process.stdout.write(JSON.stringify({ ...spacing, ...extendSpacing }));',
    '  } catch {',
    '    process.exit(1);',
    '  }',
    '})();',
  ].join('\n');

  const child = spawnSync(process.execPath, ['-e', script, resolvedPath], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (child.error || child.status !== 0) {
    return null;
  }

  if (typeof child.stdout !== 'string' || child.stdout.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(child.stdout);
    return isPlainObject(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function loadTailwindSpacing(resolvedPath) {
  if (tailwindSpacingCache.has(resolvedPath)) {
    return tailwindSpacingCache.get(resolvedPath);
  }

  const spacing =
    loadTailwindSpacingFromRequire(resolvedPath) ||
    loadTailwindSpacingFromDynamicImport(resolvedPath);

  tailwindSpacingCache.set(resolvedPath, spacing);
  return spacing;
}

function mergeTokenMapFromTailwindSpacing({
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

  for (const [key, value] of Object.entries(spacing)) {
    if (typeof value !== 'string') {
      continue;
    }

    const parsed = parseLengthToken(value);
    if (!parsed || parsed.number === 0) {
      continue;
    }

    const absolute = Math.abs(parsed.number);
    const normalizedRaw = formatLength(absolute, parsed.unit || 'px');
    nextMap[normalizedRaw] = `theme(spacing.${key})`;
    if (origins && !origins[nextMap[normalizedRaw]]) {
      origins[nextMap[normalizedRaw]] = displayOrigin(resolvedPath);
    }
  }

  return nextMap;
}

/**
 * The raw-length to token-reference map a rule fixes with. Pass `origins` to
 * also learn where each token reference came from (the token map file, the
 * stylesheet, the Tailwind config), keyed by the reference; an explicit
 * `tokenMap` entry has no origin.
 */
function buildEffectiveTokenMap({
  options,
  origins = null,
  root,
  tokenRegex,
}) {
  let tokenMap = {};

  if (options.tokenMapFile) {
    tokenMap = mergeTokenMapFromFile({
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
      currentMap: tokenMap,
      origins,
      tailwindConfigPath: options.tailwindConfigPath,
    });
  }

  // Explicit tokenMap applied last so it takes precedence over auto-derived tokens
  tokenMap = mergeExplicitTokenMap(tokenMap, options.tokenMap);

  return tokenMap;
}

module.exports = {
  buildEffectiveTokenMap,
};
