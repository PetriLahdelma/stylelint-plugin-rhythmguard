'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { parseLengthToken, toPx } = require('./length');
const { buildEffectiveTokenMap } = require('./token-map');
const { collectScssTokens, createTokenKindMatcher, parseTokenSources } = require('./token-sources');
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
const TOKEN_PACKAGES = require('./token-packages.json').packages;

/**
 * Installed design-token packages that ship a spacing scale (allowlist in
 * token-packages.json). Resolved from the project, so only what the project
 * actually depends on is read. Returns token-source entries.
 */
function readDirectDependencies(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ]);
  } catch {
    return null;
  }
}

/**
 * Project roots from cwd up to the repository boundary (first directory holding
 * .git), each with the dependencies it declares directly. Hoisted monorepo
 * installs are found by walking up; a stray global node_modules is never
 * consulted because the walk stops at the repository.
 */
function projectRoots(cwd) {
  const roots = [];
  let current = path.resolve(cwd);
  for (;;) {
    const direct = readDirectDependencies(current);
    if (direct) {
      roots.push({ dir: current, direct });
    }
    const parent = path.dirname(current);
    if (fs.existsSync(path.join(current, '.git')) || parent === current) {
      break;
    }
    current = parent;
  }
  return roots;
}

function discoverTokenPackages(cwd = process.cwd()) {
  const sources = [];
  const roots = projectRoots(cwd);
  for (const entry of TOKEN_PACKAGES) {
    // Only packages the project depends on directly count. A transitive
    // tailwindcss (for example via stylelint-config-tailwindcss) must not hand
    // a non-Tailwind project the Tailwind scale.
    const owner = roots.find((root) => root.direct.has(entry.name));
    if (!owner) {
      continue;
    }
    const root = roots
      .map((candidate) => path.join(candidate.dir, 'node_modules', entry.name))
      .find((dir) => fs.existsSync(path.join(dir, 'package.json')));
    if (!root) {
      continue;
    }
    for (const file of entry.files) {
      const resolved = path.join(root, file);
      if (fs.existsSync(resolved)) {
        sources.push({
          format: 'auto',
          package: entry.name,
          path: resolved,
          ...(entry.tokenPattern ? { tokenPattern: entry.tokenPattern } : {}),
        });
      }
    }
  }
  return sources;
}

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
      ...(source.tokenPattern ? { tokenPattern: source.tokenPattern } : {}),
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
      return `${source.path}|${source.format}|${source.tokenPattern || ''}|${mtime}`;
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
  // scaleFromDefinitions also expands a bare Tailwind --spacing base into its multiples.
  const scale = scaleFromDefinitions(parsed.definitions, baseFontSize);
  const outcome = scale
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

/**
 * Sass variables and maps declared in the linted stylesheet itself (postcss-scss
 * exposes them as declarations whose prop starts with `$`). Evaluated with the
 * same collector the audit uses; component variables such as $dropdown-spacer
 * are excluded by the anchored name rule.
 */
function sassValuesFromRoot(root) {
  const lines = [];
  root.walkDecls((decl) => {
    if (typeof decl.prop === 'string' && decl.prop.startsWith('$')) {
      lines.push(`${decl.prop}: ${decl.value};`);
    }
  });
  if (lines.length === 0) {
    return [];
  }
  return collectScssTokens(lines.join('\n'), createTokenKindMatcher('spacing')).map((token) => token.value);
}

function scaleFromTokenMap(map, baseFontSize, extraKeys = []) {
  const keys = [...extraKeys];
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
    const scale = scaleFromTokenMap(stylesheetMap, baseFontSize, sassValuesFromRoot(root));
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

  const fromPackages = scaleFromSources(discoverTokenPackages(process.cwd()), baseFontSize);
  if (fromPackages) {
    return { source: 'token-package', ...fromPackages };
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
  discoverTokenPackages,
  resolveAutoScale,
  scaleFromDefinitions,
};
