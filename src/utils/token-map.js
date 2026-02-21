'use strict';

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

function addLengthValueMapping(map, rawLength, tokenReference, baseFontSize) {
  if (typeof rawLength !== 'string') {
    return;
  }

  const parsed = parseLengthToken(rawLength);
  if (!parsed) {
    return;
  }

  const token = normalizeTokenReference(tokenReference);
  if (!token) {
    return;
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

function mergeTokenMapFromFile({
  baseFontSize,
  currentMap,
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

  for (const [entryKey, entryValue] of Object.entries(parsed)) {
    if (typeof entryValue === 'string') {
      const keyAsLength = parseLengthToken(entryKey);
      const valueAsLength = parseLengthToken(entryValue);

      if (keyAsLength) {
        nextMap[entryKey] = entryValue;
        continue;
      }

      if (valueAsLength) {
        addLengthValueMapping(nextMap, entryValue, entryKey, baseFontSize);
      }

      continue;
    }

    if (typeof entryValue === 'number') {
      addLengthValueMapping(nextMap, `${entryValue}px`, entryKey, baseFontSize);
      continue;
    }

    if (isPlainObject(entryValue) && typeof entryValue.value === 'string') {
      addLengthValueMapping(nextMap, entryValue.value, entryKey, baseFontSize);
    }
  }

  return nextMap;
}

function mergeTokenMapFromCssCustomProperties({
  baseFontSize,
  currentMap,
  root,
  tokenRegex,
}) {
  const nextMap = {
    ...currentMap,
  };

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!prop.startsWith('--')) {
      return;
    }

    if (!tokenRegex.test(prop)) {
      return;
    }

    const parsed = parseLengthToken(decl.value);
    if (!parsed || parsed.number === 0) {
      return;
    }

    addLengthValueMapping(nextMap, decl.value, `var(${decl.prop})`, baseFontSize);
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
  }

  return nextMap;
}

function buildEffectiveTokenMap({
  options,
  root,
  tokenRegex,
}) {
  let tokenMap = mergeExplicitTokenMap({}, options.tokenMap);

  if (options.tokenMapFile) {
    tokenMap = mergeTokenMapFromFile({
      baseFontSize: options.baseFontSize,
      currentMap: tokenMap,
      tokenMapFile: options.tokenMapFile,
    });
  }

  if (options.tokenMapFromCssCustomProperties) {
    tokenMap = mergeTokenMapFromCssCustomProperties({
      baseFontSize: options.baseFontSize,
      currentMap: tokenMap,
      root,
      tokenRegex,
    });
  }

  if (options.tokenMapFromTailwindSpacing && options.tailwindConfigPath) {
    tokenMap = mergeTokenMapFromTailwindSpacing({
      currentMap: tokenMap,
      tailwindConfigPath: options.tailwindConfigPath,
    });
  }

  return tokenMap;
}

module.exports = {
  buildEffectiveTokenMap,
};
