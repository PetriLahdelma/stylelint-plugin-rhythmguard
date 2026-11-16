'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadRcDecisionWarnings, loadRcDecisions } = require('./decisions');
const { cachedByFiles } = require('./fs-cache');
const { parseLengthToken, toPx } = require('./length');
const { resolveAutoScale } = require('./scale-inference');
const { parseTokenSources } = require('./token-sources');
const { TAILWIND_SCALE_NAME, TAILWIND_SPACING_UNIT_REM, tailwindSpacingLadder } = require('../presets/default-scale');
const { PRESET_ALIASES, getScalePreset } = require('../presets/scales');

/**
 * The project's scale for `tailwind-class-use-scale`, read the way the
 * Stylelint rules read it and without running project code (cs-03, ds-03):
 *
 * - `tailwindCss`: a Tailwind v4 CSS entry point. Its `--spacing` is the
 *   spacing unit (`initial` turns the numeric utilities off), its
 *   `--spacing-<name>` tokens are the named utilities Tailwind generates
 *   (`--spacing-md: 16px` is `p-md`), and both feed the scale.
 * - `scaleSources`: token files (CSS, SCSS, DTCG and other JSON), parsed by
 *   core/token-sources.
 * - `scale: "auto"`: `resolveAutoScale` over those, then the nearest
 *   `.rhythmguardrc.json` (`audit.tokenSources`), then installed token
 *   packages, then `preset` or Tailwind's default ladder on the spacing unit.
 * - `decisions` of that rc: `adopt` and `allow` values are not findings.
 *
 * `tailwindConfigPath` is the only option that runs a file (`require()`), and
 * only because the ESLint config names it; no repository file such as the rc
 * can make the rule load code (SECURITY.md, #397). Every file read is cached
 * and revalidated by mtime (core/fs-cache).
 */

const RC_FILE = '.rhythmguardrc.json';
const SPACING_BASE = '--spacing';
const SPACING_PREFIX = '--spacing-';
const CSS_EXTENSIONS = /\.(?:css|pcss|postcss|scss|sass|less)$/i;

/** Preset names the option accepts, aliases included, for the rule schema. */
function presetNames() {
  const { listScalePresetNames } = require('../presets/scales');
  return Array.from(new Set([...listScalePresetNames(), ...Object.keys(PRESET_ALIASES)])).sort();
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** The directory holding the nearest `.rhythmguardrc.json` at or above `startDir`, or null. */
function nearestRcDir(startDir) {
  const start = path.resolve(startDir);
  return cachedByFiles(`rc-nearest:${start}`, (consult) => {
    let current = start;
    for (;;) {
      const candidate = path.join(current, RC_FILE);
      consult(candidate);
      if (fs.existsSync(candidate)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  });
}

/**
 * The root font size a stylesheet sets on `html` or `:root` (`font-size:
 * 62.5%` is 10px), or null. Read as text: only px and % are taken, the last
 * one wins, and a value under a media query is read like any other.
 */
function rootFontSizeOf(file) {
  return cachedByFiles(`root-font-size:${file}`, (consult) => {
    consult(file);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      // A missing or unreadable file has no root font size; the token reader
      // reports the same file as not found.
      void error;
      return null;
    }
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    let size = null;
    for (const block of css.matchAll(/(?:^|[\s,;{}])(?:html|:root)\s*\{([^{}]*)\}/g)) {
      const declaration = /(?:^|[;\s])font-size\s*:\s*(\d*\.?\d+)(px|%)\s*(?:!important\s*)?(?:;|$)/i.exec(block[1]);
      if (declaration) {
        const number = Number(declaration[1]);
        size = declaration[2] === '%' ? (16 * number) / 100 : number;
      }
    }
    return isPositiveNumber(size) ? size : null;
  });
}

/**
 * `--spacing` and the `--spacing-<name>` tokens of a Tailwind CSS entry.
 * `unit` is the spacing unit in px, `false` for `--spacing: initial`, or
 * undefined when the entry does not set it. `tokens` are `{ name, px }`.
 */
function readTheme(file, baseFontSize) {
  return cachedByFiles(`tailwind-theme:${file}:${baseFontSize}`, (consult) => {
    consult(file);
    const parsed = parseTokenSources({
      baseFontSize,
      sources: [{ baseDir: path.dirname(file), format: 'css', path: path.basename(file) }],
      tokenKind: 'spacing',
    });
    let unit;
    const tokens = [];
    for (const definition of parsed.definitions.values()) {
      const values = Array.from(definition.values || []);
      if (definition.token === SPACING_BASE) {
        const value = String(values[0] || '').trim().toLowerCase();
        unit = value === 'initial' ? false : pxOf(value, baseFontSize);
        continue;
      }
      if (!definition.token.startsWith(SPACING_PREFIX)) {
        continue;
      }
      const name = definition.token.slice(SPACING_PREFIX.length);
      const px = values.length === 1 ? pxOf(values[0], baseFontSize) : undefined;
      if (/^[\w.-]+$/.test(name) && isPositiveNumber(px)) {
        tokens.push({ name, px });
      }
    }
    return { tokens, unit, warnings: parsed.warnings };
  });
}

function pxOf(value, baseFontSize) {
  const parsed = parseLengthToken(String(value).trim());
  if (!parsed || parsed.unit === '' || parsed.unit === '%') {
    return parsed && parsed.number === 0 ? 0 : undefined;
  }
  const px = toPx(parsed.number, parsed.unit, baseFontSize);
  return px === null ? undefined : px;
}

/** A token source entry with its path resolved from the ESLint working directory. */
function absoluteSource(entry, cwd) {
  if (typeof entry === 'string') {
    return { baseDir: cwd, path: entry };
  }
  if (entry && typeof entry === 'object') {
    return { ...entry, baseDir: path.resolve(cwd, entry.baseDir || '.') };
  }
  return entry;
}

function sourceFile(entry) {
  const file = entry && (entry.path || entry.file);
  return typeof file === 'string' ? path.resolve(entry.baseDir, file) : null;
}

/**
 * Resolve the options of one lint of `tailwind-class-use-scale` against the
 * project. `cwd` is ESLint's working directory, which relative paths in the
 * options are read from; `filename` is the linted file, from which the nearest
 * `.rhythmguardrc.json` is found. Returns options for
 * `createTailwindClassAnalyzer`, the rc decisions, and the warnings to show
 * once per file. Never throws for a missing or broken file.
 */
function resolveTailwindProjectOptions(option = {}, { cwd = process.cwd(), filename = null } = {}) {
  const warnings = [];
  const entry = typeof option.tailwindCss === 'string' && option.tailwindCss ? path.resolve(cwd, option.tailwindCss) : null;
  if (entry && !fs.existsSync(entry)) {
    warnings.push(`Tailwind CSS entry not found: ${option.tailwindCss}`);
  }
  const scaleSources = Array.isArray(option.scaleSources) ? option.scaleSources.map((source) => absoluteSource(source, cwd)) : [];
  const cssFiles = [entry, ...scaleSources.map(sourceFile)].filter((file) => file && CSS_EXTENSIONS.test(file));

  // baseFontSize first: rem tokens and `--spacing: 0.25rem` are read through it.
  let baseFontSize = isPositiveNumber(option.baseFontSize) ? option.baseFontSize : null;
  if (baseFontSize === null) {
    for (const file of cssFiles) {
      const size = rootFontSizeOf(file);
      if (size !== null) {
        baseFontSize = size;
      }
    }
  }
  baseFontSize = baseFontSize || 16;

  const theme = entry && fs.existsSync(entry) ? readTheme(entry, baseFontSize) : { tokens: [], unit: undefined, warnings: [] };
  warnings.push(...theme.warnings);
  let spacingUnit = option.spacingUnit;
  if (spacingUnit === undefined && theme.unit !== undefined) {
    spacingUnit = theme.unit;
  }
  const ladderUnit = isPositiveNumber(spacingUnit) ? spacingUnit : baseFontSize * TAILWIND_SPACING_UNIT_REM;

  const presetName = typeof option.preset === 'string' && getScalePreset(option.preset) ? option.preset : null;
  const auto = option.scale === 'auto' || (option.scale === undefined && (scaleSources.length > 0 || entry !== null));
  const rcDir = nearestRcDir(filename && path.isAbsolute(filename) ? path.dirname(filename) : cwd);

  let scale;
  let scaleName = null;
  let source = Array.isArray(option.scale) ? 'explicit' : 'default';
  if (Array.isArray(option.scale)) {
    scale = option.scale;
  } else if (auto) {
    const inference = resolveAutoScale({
      baseFontSize,
      cwd: rcDir || cwd,
      fallbackPreset: presetName || 'tailwind',
      scaleSources: entry ? [...scaleSources, { baseDir: path.dirname(entry), format: 'css', path: path.basename(entry) }] : scaleSources,
      tailwindConfigPath: typeof option.tailwindConfigPath === 'string' && option.tailwindConfigPath
        ? path.resolve(cwd, option.tailwindConfigPath)
        : null,
    });
    source = inference.source;
    if (inference.source !== 'fallback') {
      scale = inference.scale;
    } else if (presetName) {
      scale = getScalePreset(presetName);
      scaleName = `preset "${presetName}"`;
    } else {
      // No tokens anywhere: Tailwind's ladder on the project's spacing unit,
      // as with no `scale` at all.
      scale = tailwindSpacingLadder(ladderUnit);
      scaleName = TAILWIND_SCALE_NAME;
    }
    if (inference.source === 'fallback' && (scaleSources.length > 0 || entry)) {
      warnings.push(`No spacing tokens were found for scale "auto"; using ${scaleName}`);
    }
    warnings.push(...(inference.warnings || []));
  } else if (presetName) {
    scale = getScalePreset(presetName);
    source = 'preset';
  }

  let decisions = [];
  if (option.decisions !== false && rcDir) {
    try {
      decisions = loadRcDecisions(rcDir, { baseFontSize });
      warnings.push(...loadRcDecisionWarnings(rcDir, { baseFontSize }));
    } catch (error) {
      // An invalid decisions section: the lint goes on without decisions and says so.
      warnings.push(`${RC_FILE} decisions are not applied: ${error.message}`);
    }
  }

  return {
    analyzerOptions: {
      baseFontSize,
      ...(scale ? { scale } : {}),
      scaleName,
      ...(spacingUnit !== undefined ? { spacingUnit } : {}),
      themeSpacing: theme.tokens,
    },
    decisions,
    source,
    warnings: Array.from(new Set(warnings)),
  };
}

module.exports = {
  nearestRcDir,
  presetNames,
  resolveTailwindProjectOptions,
  rootFontSizeOf,
};
