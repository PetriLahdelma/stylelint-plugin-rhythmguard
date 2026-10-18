'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readJsonFile } = require('./json');
const { parseLengthToken, toPx } = require('./length');
const { buildEffectiveTokenMap } = require('./token-map');
const {
  addDefinition,
  collectScssTokens,
  createTokenKindMatcher,
  parseTokenSources,
  parseTokenValueLength,
} = require('./token-sources');
const { normalizeTokenSourceEntry } = require('./token-source-entries');
const { getScalePreset } = require('../presets/scales');

// Matches the audit default so lint and audit agree on what a spacing token is.
const DEFAULT_AUTO_TOKEN_PATTERN = '(^--|-)(?<!letter-)(?<!word-)(space|spacing|spacer)(-|$)';
// Tailwind v4 defines one base (`--spacing: 0.25rem`) and derives utilities by multiplying it.
// A bare `--space` is not Tailwind's; it is one token like any other (issue #293).
const TAILWIND_BASE_TOKENS = new Set(['--spacing']);
const TAILWIND_SPACING_MULTIPLIERS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];
const FALLBACK_PRESET = 'rhythmic-4';
// Zero plus at least three distinct token values; a one- or two-token scale is worse than the default.
const MIN_INFERRED_SCALE_LENGTH = 4;
const RC_FILE = '.rhythmguardrc.json';

const { cachedByFiles } = require('./fs-cache');

const TOKEN_PACKAGES = require('./token-packages.json').packages;

/**
 * Installed design-token packages that ship a spacing scale (allowlist in
 * token-packages.json). Resolved from the project, so only what the project
 * actually depends on is read. Returns token-source entries.
 */
function readDirectDependencies(dir) {
  try {
    const pkg = readJsonFile(path.join(dir, 'package.json'));
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
function projectRoots(cwd, consult = () => {}) {
  const roots = [];
  let current = path.resolve(cwd);
  for (;;) {
    consult(path.join(current, 'package.json'));
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
  return cachedByFiles(`packages:${path.resolve(cwd)}`, (consult) => discoverTokenPackagesUncached(cwd, consult));
}

function discoverTokenPackagesUncached(cwd, consult) {
  const sources = [];
  const roots = projectRoots(cwd, consult);
  for (const entry of TOKEN_PACKAGES) {
    // Only packages the project depends on directly count. A transitive
    // tailwindcss (for example via stylelint-config-tailwindcss) must not hand
    // a non-Tailwind project the Tailwind scale.
    const owner = roots.find((root) => root.direct.has(entry.name));
    if (!owner) {
      continue;
    }
    const candidates = roots.map((candidate) => path.join(candidate.dir, 'node_modules', entry.name));
    for (const dir of candidates) {
      consult(path.join(dir, 'package.json'));
    }
    const root = candidates.find((dir) => fs.existsSync(path.join(dir, 'package.json')));
    if (!root) {
      continue;
    }
    for (const file of entry.files) {
      const resolved = path.join(root, file);
      consult(resolved);
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

/** A non-zero number without a unit is a ratio or a multiplier, not a length (issue #268). */
function isUnitlessNonZero(parsed) {
  return parsed.unit === '' && parsed.number !== 0;
}

function pxValuesFromKeys(keys, baseFontSize) {
  const values = new Set([0]);

  for (const key of keys) {
    const parsed = parseLengthToken(String(key));
    if (!parsed || isUnitlessNonZero(parsed)) {
      continue;
    }

    const px = toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize);
    if (px !== null && Number.isFinite(px)) {
      values.add(px);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * Parse token sources once per (source set, base font size), revalidated by
 * the mtime of every source file. The entry is keyed by the paths alone and
 * replaced when a file changes, so an editor that saves a token file a
 * thousand times keeps one entry, not a thousand (issue #264). Entries that
 * do not normalise (a bad format, no path) are skipped with a warning; they
 * never throw out of a lint.
 */
function parseSourcesCached(sources, baseFontSize) {
  const normalized = [];
  const warnings = [];
  for (const entry of sources) {
    const { error, source } = normalizeTokenSourceEntry(entry, process.cwd());
    if (error) {
      warnings.push(error);
    } else {
      normalized.push(source);
    }
  }
  if (normalized.length === 0) {
    return warnings.length > 0 ? { definitions: new Map(), sources: [], warnings } : null;
  }
  const files = normalized.map((source) => path.resolve(source.baseDir, source.path));
  const key = [
    `token-sources:${baseFontSize}`,
    ...normalized.map((source, index) => `${files[index]}|${source.format}|${source.tokenPattern || ''}`),
  ].join('\n');
  const parsed = cachedByFiles(key, (consult) => {
    for (const file of files) {
      consult(file);
    }
    return parseTokenSources({ baseFontSize, sources: normalized, tokenKind: 'spacing' });
  });
  return warnings.length > 0 ? { ...parsed, warnings: [...warnings, ...parsed.warnings] } : parsed;
}

/**
 * Token sources read for the spacing names and, when a rule sets its own
 * `tokenPattern` (`^--space-|^--radius-`), for that pattern too, on top of the
 * spacing names, unless a source sets its own. Fixes and scale inference read
 * the same tokens through this (issue #296).
 */
function parseSourcesWithPattern(sources, baseFontSize, tokenPattern = null) {
  const plain = parseSourcesCached(sources, baseFontSize);
  if (!tokenPattern || !plain) {
    return plain;
  }
  const withPattern = parseSourcesCached(
    sources.map((source) => (typeof source === 'string' ? { path: source, tokenPattern } : { tokenPattern, ...source })),
    baseFontSize,
  );
  const definitions = new Map(plain.definitions);
  for (const [token, definition] of withPattern ? withPattern.definitions : []) {
    if (!definitions.has(token)) {
      definitions.set(token, definition);
    }
  }
  const warnings = Array.from(new Set([...plain.warnings, ...(withPattern ? withPattern.warnings : [])]));
  return { definitions, sources: plain.sources, warnings };
}

/**
 * The scale a list of token sources defines, or null. Warnings from sources
 * that are missing or do not parse go into `warnings` either way, so a
 * fallback can say which source failed (issue #270).
 */
function scaleFromSources(sources, baseFontSize, warnings = [], tokenPattern = null) {
  const parsed = parseSourcesWithPattern(sources, baseFontSize, tokenPattern);
  if (!parsed) {
    return null;
  }
  warnings.push(...parsed.warnings);
  // scaleFromDefinitions also expands a bare Tailwind --spacing base into its multiples.
  const scale = scaleFromDefinitions(parsed.definitions, baseFontSize);
  return scale
    ? {
      files: parsed.sources.map((source) => source.file),
      scale,
      tokenCount: parsed.definitions.size,
      warnings: parsed.warnings,
    }
    : null;
}

/**
 * Every spacing token definition visible from a stylesheet, for fixes that
 * write tokens: the stylesheet's own declarations, then `scaleSources`,
 * `.rhythmguardrc.json` token sources and installed token packages. The same
 * places scale inference reads, in the same order.
 */
function collectTokenDefinitions({ baseFontSize = 16, root, scaleSources = [], tokenPattern = null, tokenRegex }) {
  const definitions = root ? stylesheetDefinitions(root, tokenRegex, baseFontSize) : new Map();
  const sources = [...scaleSources, ...rcTokenSources(process.cwd()).sources, ...discoverTokenPackages(process.cwd())];
  const parsed = parseSourcesWithPattern(sources, baseFontSize, tokenPattern);
  for (const [token, definition] of parsed ? parsed.definitions : []) {
    if (!definitions.has(token)) {
      definitions.set(token, definition);
    }
  }
  return definitions;
}

/**
 * Build a px scale from token definitions. Root-level declarations win: when
 * the definitions declared in `:root`, `html` or `@theme` form a scale on
 * their own, component-local variables (`--chip-spacing: 3px` inside `.chip`)
 * are left out, because they are a component's parameters, not the project's
 * scale (issue #54). When the root does not carry a scale, everything counts
 * and the plausibility check is the backstop. Returns the values and the
 * definitions that produced them, so provenance can name only those files.
 */
function inferScaleFromDefinitions(definitions, baseFontSize = 16) {
  const rootOnly = new Map();
  for (const [token, definition] of definitions) {
    if (!definition.scopes || definition.scopes.has('root')) {
      rootOnly.set(token, definition);
    }
  }
  if (rootOnly.size > 0 && rootOnly.size < definitions.size) {
    const fromRoot = scaleFromAllDefinitions(rootOnly, baseFontSize);
    if (fromRoot) {
      return { definitions: rootOnly, values: fromRoot };
    }
  }
  const values = scaleFromAllDefinitions(definitions, baseFontSize);
  return values ? { definitions, values } : null;
}

function scaleFromDefinitions(definitions, baseFontSize = 16) {
  const inferred = inferScaleFromDefinitions(definitions, baseFontSize);
  return inferred ? inferred.values : null;
}

function scaleFromAllDefinitions(definitions, baseFontSize) {
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

/** The scope of a declaration node: the AST-side twin of customPropertyDeclarations. */
function scopeOfNode(decl) {
  for (let node = decl.parent; node; node = node.parent) {
    if (node.type === 'rule') {
      return String(node.selector).split(',').every((selector) => ROOT_SELECTOR.test(selector.trim())) ? 'root' : 'component';
    }
    if (node.type === 'atrule') {
      const name = String(node.name).toLowerCase();
      if (name === 'theme') return 'root';
      if (!TRANSPARENT_AT_RULES.has(name)) return 'component';
    }
  }
  return 'root';
}

const ROOT_SELECTOR = /^(?::root|html|:host|:(?:where|is)\(\s*(?::root|html)\s*\))$/i;
const TRANSPARENT_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document']);

/** Token definitions declared in the linted stylesheet itself: custom properties with their scope, plus Sass variables and maps. */
function stylesheetDefinitions(root, tokenRegex, baseFontSize) {
  const definitions = new Map();
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!prop.startsWith('--') || !tokenRegex.test(prop)) {
      return;
    }
    const parsed = parseTokenValueLength(decl.value);
    if (!parsed || parsed.number === 0) {
      return;
    }
    addDefinition(definitions, { baseFontSize, file: 'stylesheet', scope: scopeOfNode(decl), source: 'stylesheet', token: decl.prop, value: decl.value });
  });
  for (const sassToken of sassTokensFromRoot(root)) {
    addDefinition(definitions, { baseFontSize, file: 'stylesheet', scope: 'root', source: 'stylesheet', token: sassToken.token, value: sassToken.value });
  }
  return definitions;
}

/**
 * Merge Tailwind-style base multiples into a scale when a bare --spacing base
 * is defined. Only the first base found is expanded: a project that ships
 * several theme files with different bases (shadcn/ui) has one active base at a
 * time, and a union of ladders is a scale nobody designed (issue #89).
 */
function expandTailwindBase(scale, baseKeys, baseFontSize) {
  const base = firstPositivePx(baseKeys, baseFontSize);
  if (base === null) {
    return scale;
  }
  const values = new Set(scale);
  for (const multiplier of TAILWIND_SPACING_MULTIPLIERS) {
    values.add(Math.round(base * multiplier * 1000) / 1000);
  }
  return Array.from(values).sort((a, b) => a - b);
}

function firstPositivePx(keys, baseFontSize) {
  for (const key of keys) {
    const parsed = parseLengthToken(String(key));
    if (!parsed || isUnitlessNonZero(parsed)) {
      continue;
    }
    const px = toPx(Math.abs(parsed.number), parsed.unit || 'px', baseFontSize);
    if (px !== null && Number.isFinite(px) && px > 0) {
      return px;
    }
  }
  return null;
}

function rcTokenSources(cwd) {
  const rcPath = path.join(cwd, RC_FILE);
  return cachedByFiles(`rc:${rcPath}`, (consult) => {
    consult(rcPath);
    return rcTokenSourcesUncached(rcPath);
  });
}

/**
 * Token sources from `audit.tokenSources` in .rhythmguardrc.json, read through
 * the normaliser the audit uses, so lint and audit read the same files
 * (issue #271). A file that does not parse or an entry that does not
 * normalise is a warning, never a throw (issue #265).
 */
function rcTokenSourcesUncached(rcPath) {
  if (!fs.existsSync(rcPath)) {
    return { sources: [], warnings: [] };
  }

  let config;
  try {
    config = readJsonFile(rcPath);
  } catch (err) {
    return { sources: [], warnings: [`${RC_FILE} could not be read: ${err.message}`] };
  }

  const audit = config && typeof config === 'object' ? config.audit : null;
  const entries = audit && Array.isArray(audit.tokenSources) ? audit.tokenSources : [];
  const baseDir = path.dirname(rcPath);
  const sources = [];
  const warnings = [];
  for (const entry of entries) {
    const { error, source } = normalizeTokenSourceEntry(entry, baseDir);
    if (error) {
      warnings.push(`${RC_FILE}: ${error}`);
    } else {
      sources.push(source);
    }
  }
  return { sources, warnings };
}

/**
 * Sass variables and maps declared in the linted stylesheet itself (postcss-scss
 * exposes them as declarations whose prop starts with `$`). Evaluated with the
 * same collector the audit uses; component variables such as $dropdown-spacer
 * are excluded by the anchored name rule.
 */
function sassTokensFromRoot(root) {
  const lines = [];
  root.walkDecls((decl) => {
    // Only top-level or `!global` variables are the project's; `$spacer: 2px`
    // inside `.compact` is local to that block (issue #266).
    const global = (decl.parent && decl.parent.type === 'root') || /!global\b/.test(String(decl.value));
    if (typeof decl.prop === 'string' && decl.prop.startsWith('$') && global) {
      lines.push(`${decl.prop}: ${decl.value};`);
    }
  });
  if (lines.length === 0) {
    return [];
  }
  return collectScssTokens(lines.join('\n'), createTokenKindMatcher('spacing'));
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
 * the provenance is a single file list or the stylesheet. The order, which
 * docs/rules/use-scale.md documents: `scaleSources`, `.rhythmguardrc.json`
 * token sources, the linted stylesheet, `tailwindConfigPath`, installed token
 * packages, the fallback preset. `sourceTokenPattern` is the rule's own
 * explicit `tokenPattern`, applied to the token files as fixes apply it.
 */
function resolveAutoScale({
  baseFontSize = 16,
  root,
  scaleSources = [],
  sourceTokenPattern = null,
  tailwindConfigPath = null,
  tokenPattern = DEFAULT_AUTO_TOKEN_PATTERN,
} = {}) {
  // Warnings from every source tried, for the fallback note when none yields a scale.
  const warnings = [];
  const fromOption = scaleFromSources(scaleSources, baseFontSize, warnings, sourceTokenPattern);
  if (fromOption) {
    return { source: 'scaleSources', ...fromOption };
  }

  const rc = rcTokenSources(process.cwd());
  warnings.push(...rc.warnings);
  const fromRc = scaleFromSources(rc.sources, baseFontSize, warnings, sourceTokenPattern);
  if (fromRc) {
    return { source: 'rhythmguardrc', ...fromRc };
  }

  let tokenRegex;
  try {
    tokenRegex = new RegExp(tokenPattern);
  } catch {
    tokenRegex = new RegExp(DEFAULT_AUTO_TOKEN_PATTERN);
  }

  let rejected = null;
  if (root) {
    const scale = scaleFromDefinitions(stylesheetDefinitions(root, tokenRegex, baseFontSize), baseFontSize);
    if (scale) {
      const assessment = assessScale({ source: 'stylesheet', values: scale });
      if (assessment.plausible) {
        return { files: [], scale, source: 'stylesheet', tokenCount: scale.length - 1, warnings: [] };
      }
      rejected = { reasons: assessment.reasons, source: 'stylesheet', values: scale };
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

  const fromPackages = scaleFromSources(discoverTokenPackages(process.cwd()), baseFontSize, warnings, sourceTokenPattern);
  if (fromPackages) {
    return { source: 'token-package', ...fromPackages };
  }

  return fallbackInference(rejected, warnings);
}

const TRUSTED_SCALE_SOURCES = new Set(['scaleSources', 'rhythmguardrc', 'token-sources', 'tailwind', 'token-package', 'explicit', 'default']);
const TOKEN_FILE_PATTERN = /(token|variable|spacing|space|theme|primitive|global|scale|layout)/i;
const LADDER_STEPS = [2, 3, 4, 5, 8];
const MIN_ASSESSED_STEPS = 3;
// A scale with more steps than this must be a near-perfect ladder; otherwise it
// is a list of every value a codebase happens to use (Semi Design: 42 steps).
const MAX_LOOSE_STEPS = 24;

/**
 * Inference can pick up component-local variables (`--chip-spacing: 3px`) and
 * assemble a "scale" nobody designed. Explicit sources are trusted. An inferred
 * scale is plausible when it has at least three positive steps, is mostly whole
 * pixels, mostly shares a common step (2, 3, 4, 5 or 8), and, past two dozen
 * steps, is a near-perfect ladder. When the source
 * files are known, a set that comes mostly from component files must be a
 * near-perfect ladder to pass. Fallback is never the project's scale.
 */
function assessScale({ files = null, source, values = [] } = {}) {
  if (source === 'fallback') {
    return { plausible: false, reasons: ['fallback'] };
  }
  if (TRUSTED_SCALE_SOURCES.has(source)) {
    return { plausible: true, reasons: [] };
  }
  const positives = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const integers = positives.filter(Number.isInteger);
  const integerShare = positives.length ? integers.length / positives.length : 0;
  const coherence = positives.length
    ? Math.max(...LADDER_STEPS.map((step) => integers.filter((value) => value % step === 0).length / positives.length))
    : 0;
  const reasons = [];
  if (positives.length < MIN_ASSESSED_STEPS) reasons.push('fewer than three steps');
  if (integerShare < 0.8) reasons.push('fractional values');
  if (coherence < 0.7) reasons.push('no common step');
  if (positives.length > MAX_LOOSE_STEPS && coherence < 0.9) reasons.push('too many steps');
  if (Array.isArray(files) && files.length > 0) {
    const tokenFileShare = files.filter((file) => TOKEN_FILE_PATTERN.test(file)).length / files.length;
    if (tokenFileShare < 0.5 && coherence < 0.9) reasons.push('sources are component files');
  }
  return { plausible: reasons.length === 0, reasons };
}

function fallbackInference(rejected = null, warnings = []) {
  return {
    files: [],
    preset: FALLBACK_PRESET,
    ...(rejected ? { rejected } : {}),
    scale: getScalePreset(FALLBACK_PRESET),
    source: 'fallback',
    tokenCount: 0,
    warnings,
  };
}

/**
 * Apply `scale: "auto"` to built rule options: the inferred scale replaces the
 * placeholder and the inference is kept for the fallback note. Options with
 * an explicit scale pass through untouched.
 */
function withResolvedScale(options, root) {
  if (options.scaleAuto) {
    const inference = resolveAutoScale({
      baseFontSize: options.baseFontSize,
      root,
      scaleSources: options.scaleSources,
      sourceTokenPattern: options.tokenPatternExplicit ? options.tokenPattern : null,
      tailwindConfigPath: options.tailwindConfigPath,
      tokenPattern: options.tokenPatternExplicit ? options.tokenPattern : DEFAULT_AUTO_TOKEN_PATTERN,
    });
    options.scale = inference.scale;
    options.scaleInference = inference;
  }
  for (const [group, entry] of Object.entries(options.groupScales || {})) {
    if (entry.auto) {
      entry.scale = inferGroupScale(group, options, root);
    }
  }
  return options;
}

// Token names each group's "auto" reads. Spacing is the project scale itself.
const GROUP_TOKEN_PATTERNS = Object.freeze({
  radius: /^--radius-/,
  size: /^--(?:size|width|height|container)-/,
  // Tailwind's `--text-sm--line-height` is a sub-token of `--text-sm`, not a font size (issue #262).
  typography: /^--(?:font-size|text|fs)-(?!.*--)/,
});

/**
 * A group's scale from its own tokens (`--font-size-*` and Tailwind's
 * `--text-*` for typography, `--radius-*` for radius). Null when fewer than
 * four values are found, and the group then uses `scale`. Fluid tokens
 * (`clamp()`) have no single value and are not part of an inferred scale.
 */
function inferGroupScale(group, options, root) {
  if (group === 'spacing') {
    if (options.scaleAuto) {
      return options.scale;
    }
    const inference = resolveAutoScale({
      baseFontSize: options.baseFontSize,
      root,
      scaleSources: options.scaleSources,
      tailwindConfigPath: options.tailwindConfigPath,
      tokenPattern: DEFAULT_AUTO_TOKEN_PATTERN,
    });
    // No spacing tokens: the group uses `scale`, like every other group (issue #261).
    return inference.source === 'fallback' ? null : inference.scale;
  }
  const pattern = GROUP_TOKEN_PATTERNS[group];
  const definitions = collectTokenDefinitions({
    baseFontSize: options.baseFontSize,
    root,
    scaleSources: options.scaleSources,
    tokenPattern: pattern.source,
    tokenRegex: pattern,
  });
  const own = new Map([...definitions].filter(([token]) => pattern.test(token)));
  return own.size > 0 ? scaleFromDefinitions(own, options.baseFontSize) : null;
}

function autoScaleFallbackNote(inference) {
  if (!inference || inference.source !== 'fallback') {
    return '';
  }
  if (inference.rejected) {
    return `The spacing tokens found do not form a spacing scale (${inference.rejected.reasons.join(', ')}); using preset "${inference.preset}".${sourceWarningsNote(inference.warnings)}`;
  }

  return `No spacing tokens were found for scale "auto"; using preset "${inference.preset}".${sourceWarningsNote(inference.warnings)}`;
}

/** Why the token sources gave nothing: a missing file, a parse error, a bad rc entry (issue #270). */
function sourceWarningsNote(warnings) {
  const unique = Array.from(new Set(warnings || []));
  return unique.map((warning) => ` ${/[.!?]$/.test(warning) ? warning : `${warning}.`}`).join('');
}

module.exports = {
  DEFAULT_AUTO_TOKEN_PATTERN,
  assessScale,
  autoScaleFallbackNote,
  collectTokenDefinitions,
  discoverTokenPackages,
  inferScaleFromDefinitions,
  resolveAutoScale,
  scaleFromDefinitions,
  withResolvedScale,
};
