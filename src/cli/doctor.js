'use strict';

/**
 * `rhythmguard doctor`: check that the setup in a directory loads and lints
 * the way the user expects, and say which spacing scale it checks against.
 *
 * `runDoctor({ cwd })` does the work and returns typed checks; it keeps no
 * module state, writes nothing and never exits the process, so quickstart, an
 * agent or a test can call it as often as it likes (cq-11). The Stylelint
 * config is loaded through the project's own Stylelint (`resolveConfig`), so
 * every `extends` and plugin is resolved as `npx stylelint` resolves it, and
 * one stylesheet is linted for real (dx-07). The ESLint side is loaded through
 * the project's own ESLint, and an ESLint-only project is checked without
 * Stylelint instead of being told to install it (ai-02).
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const postcss = require('postcss');

const { applyAuditConfig, loadAuditConfig, resolveIgnorePatterns } = require('../audit/config');
const { eslintInstallLine, stylelintInstallLine } = require('../audit/next-steps');
const { isNonAuthoredPath } = require('../audit/non-authored');
const { walkFiles } = require('../audit/scan/files');
const { DEFAULT_IGNORE_PATH, createDefaultAuditOptions } = require('../audit/shared');
const { normalizeDecisions } = require('../core/decisions');
const { readJsonFile } = require('../core/json');
const { normalizeScale } = require('../core/length');
const { buildScaleOptions } = require('../core/options');
const { DEFAULT_AUTO_TOKEN_PATTERN, resolveAutoScale } = require('../core/scale-inference');
const { createTailwindClassAnalyzer } = require('../core/tailwind-class-analysis');
const { normalizeTokenSourceEntry } = require('../core/token-source-entries');
const { normalizeTokenSourceFormat, parseTokenSources } = require('../core/token-sources');
const { DEFAULT_SCALE, TAILWIND_SCALE_NAME } = require('../presets/default-scale');
const ownPackage = require('../../package.json');

const HELP = `Usage: rhythmguard doctor

Validate the Rhythmguard setup in the current directory. Loads the Stylelint
config through the project's own Stylelint, with every extends and plugin
resolved, checks Stylelint against the plugin's peer range, lints one
stylesheet, and prints the spacing scale the rules check and where it comes
from. Loads the ESLint config through the project's own ESLint and compares
the scale tailwind-class-use-scale checks with it. In a project that uses
Rhythmguard through ESLint only (no Stylelint), checks ESLint and skips the
Stylelint checks. Also checks .rhythmguardrc.json, token sources and the
baseline. Exits 1 when a check fails; warnings do not change the exit code.

Options:
  --help        Show this help message
`;

const PLUGIN_NAME = 'stylelint-plugin-rhythmguard';
const ESLINT_PLUGIN_NAME = 'eslint-plugin-rhythmguard';
const ESLINT_RULE = 'tailwind-class-use-scale';
// The Stylelint rules whose options hold the spacing scale, in the order the scale is read from.
const SCALE_RULES = ['rhythmguard/use-scale', 'rhythmguard/no-offscale-transform'];
const TOOL_CONFIG_FILE = /^(?:\..*|.*\.config\.[cm]?[jt]s)$/;
// Stylesheets tried for the real lint, so one ignored file does not hide the check.
const MAX_LINT_ATTEMPTS = 5;

const STYLELINT_CONFIG_FILES = [
  '.stylelintrc',
  '.stylelintrc.json',
  '.stylelintrc.js',
  '.stylelintrc.cjs',
  '.stylelintrc.mjs',
  '.stylelintrc.yml',
  '.stylelintrc.yaml',
  'stylelint.config.js',
  'stylelint.config.cjs',
  'stylelint.config.mjs',
];

const ESLINT_CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
];

/** The checks of one run, and the helpers that add to them. */
function createChecks() {
  const checks = [];
  const add = (status) => (id, message, fix) => {
    checks.push({ id, status, message, ...(fix ? { fix } : {}) });
  };
  return { checks, fail: add('fail'), pass: add('pass'), skip: add('skip'), warn: add('warn') };
}

// --- Packages, resolved from the project rather than from this package ------

/**
 * A package installed for `cwd`: its directory and manifest, found the way
 * Node finds it (node_modules in cwd, then each parent). Read from disk, not
 * through `require.resolve`, so a package without a main entry or without a
 * `./package.json` export is still found. Null when absent.
 */
function findPackage(name, cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const manifestPath = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return { dir: path.dirname(manifestPath), manifest: readJsonFile(manifestPath) };
      } catch {
        return { dir: path.dirname(manifestPath), manifest: {} };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/** The entry `import()` would load: the `import` or `default` export of ".", else `main`. */
function moduleEntry(manifest) {
  const exportsField = manifest.exports;
  const root = exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField) && '.' in exportsField
    ? exportsField['.']
    : exportsField;
  const pick = (value) => {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return pick(value.import) || pick(value.node) || pick(value.default) || pick(value.require);
    }
    return null;
  };
  return pick(root) || manifest.main || 'index.js';
}

/** Load an installed package through its ESM or CJS entry; the default export when it has one. */
async function importPackage(pkg) {
  const mod = await import(pathToFileURL(path.join(pkg.dir, moduleEntry(pkg.manifest))).href);
  return mod && mod.default ? mod.default : mod;
}

// --- Version ranges ---------------------------------------------------------

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version || '').trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return 0;
}

function satisfiesComparator(version, comparator) {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(comparator);
  if (!match) {
    return false;
  }
  const operator = match[1] || '=';
  const base = [Number(match[2]), Number(match[3] || 0), Number(match[4] || 0)];
  const cmp = compareVersions(version, base);
  switch (operator) {
    case '^': {
      // ^1.2.3 is >=1.2.3 <2.0.0; ^0.2.3 is >=0.2.3 <0.3.0.
      const upper = base[0] > 0 ? [base[0] + 1, 0, 0] : [0, base[1] + 1, 0];
      return cmp >= 0 && compareVersions(version, upper) < 0;
    }
    case '~':
      return cmp >= 0 && compareVersions(version, [base[0], base[1] + 1, 0]) < 0;
    case '>=':
      return cmp >= 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '<':
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

/**
 * Whether a version satisfies an npm range of the forms package.json peer
 * ranges use: `^`, `~`, comparisons, sets joined by spaces and alternatives
 * joined by `||`. Null when the version does not parse.
 */
function satisfiesRange(version, range) {
  const parsed = parseVersion(version);
  if (!parsed) {
    return null;
  }
  return String(range).split('||').some((set) => {
    const comparators = set.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter(Boolean);
    return comparators.length > 0 && comparators.every((comparator) => satisfiesComparator(parsed, comparator));
  });
}

// --- Project files -----------------------------------------------------------

function readPackageJson(cwd) {
  try {
    return readJsonFile(path.join(cwd, 'package.json'));
  } catch {
    return null;
  }
}

/** The first config file present in cwd, or the package.json key; `{ label, path, content }` or null. */
function locateConfig(cwd, files, packageKey) {
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // Unreadable: the loader reports it with its own message.
      }
      return { content, label: file, path: fullPath };
    }
  }
  const pkg = readPackageJson(cwd);
  if (pkg && pkg[packageKey]) {
    return { content: JSON.stringify(pkg[packageKey]), label: `package.json ${packageKey} key`, path: path.join(cwd, 'package.json') };
  }
  return null;
}

function relative(cwd, file) {
  const rel = path.relative(cwd, path.resolve(cwd, file)).replace(/\\/g, '/');
  return rel || '.';
}

/** Stylesheets and class-string files, authored ones first, as the audit scans them. */
function scanProject(cwd) {
  let found = { cssFiles: [], templateFiles: [] };
  try {
    found = walkFiles(cwd, []);
  } catch {
    // An unreadable directory: the checks that need files say none were found.
  }
  const authored = (files) => files.filter((file) => !isNonAuthoredPath(relative(cwd, file)));
  const cssFiles = authored(found.cssFiles);
  // Tool configs (eslint.config.mjs, .prettierrc.js) hold no class strings.
  const templateFiles = authored(found.templateFiles).filter((file) => !TOOL_CONFIG_FILE.test(path.basename(file)));
  // Markup with class attributes first, then plain scripts.
  const markup = templateFiles.filter((file) => /\.(?:jsx|tsx|vue|svelte|astro)$/.test(file));
  const scripts = templateFiles.filter((file) => !markup.includes(file));
  return {
    classFiles: [...markup, ...scripts],
    cssFiles: [...cssFiles.filter((file) => file.endsWith('.css')), ...cssFiles.filter((file) => !file.endsWith('.css'))],
    scssFiles: cssFiles.filter((file) => file.endsWith('.scss')),
    typescript: templateFiles.some((file) => /\.tsx?$/.test(file)),
  };
}

// --- Formatting ---------------------------------------------------------------

function formatScale(values) {
  return values.length > 0 ? `${values.join(', ')}px` : '(empty)';
}

function listDifference(values) {
  const shown = values.slice(0, 8).join(', ');
  return values.length > 8 ? `${shown} and ${values.length - 8} more` : shown;
}

function firstLine(error) {
  return String((error && error.message) || error).split('\n')[0];
}

function sameValues(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// --- Stylelint ----------------------------------------------------------------

/** The secondary options of an enabled rule in a resolved config, or null when the rule is off. */
function enabledRuleOptions(rules, name) {
  if (!rules || !(name in rules)) {
    return null;
  }
  const value = rules[name];
  const primary = Array.isArray(value) ? value[0] : value;
  if (primary === null || primary === false || primary === undefined) {
    return null;
  }
  const secondary = Array.isArray(value) ? value[1] : undefined;
  return secondary && typeof secondary === 'object' ? secondary : {};
}

/** The install command for what a Stylelint configuration error names. */
function fixForConfigError(message, project) {
  const missing = /Could not find "([^"]+)"|Cannot find (?:module|package) '([^']+)'/.exec(message);
  const name = missing ? (missing[1] || missing[2]) : '';
  if (name.startsWith(PLUGIN_NAME) || name === 'stylelint-config-tailwindcss' || name === 'postcss-scss') {
    return `Run: ${stylelintInstallLine({ scss: project.scssFiles.length > 0 || name === 'postcss-scss', tailwindConfig: name === 'stylelint-config-tailwindcss' })}`;
  }
  if (name) {
    return `Run: npm install --save-dev ${name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]}`;
  }
  return 'Fix the Stylelint config; npx stylelint stops on the same error';
}

/**
 * The scale a rule's options check, and where it comes from: the same
 * resolution the rule makes (core/options, then core/scale-inference for
 * `scale: "auto"`). The sample stylesheet stands in for the linted file when
 * auto inference reaches the stylesheet tier.
 */
function resolveRuleScale({ cwd, ruleName, secondary, sample }) {
  const options = buildScaleOptions(secondary);
  if (options.invalidPreset) {
    return { error: `Unknown scale preset "${options.invalidPreset}" on ${ruleName}. Available presets: ${options.presetNames.join(', ')}.` };
  }
  const baseFontSize = options.baseFontSize;
  if (!options.scaleAuto) {
    const values = normalizeScale(options.scale, baseFontSize);
    let label;
    if (Array.isArray(secondary.customScale)) {
      label = `the "customScale" option of ${ruleName}`;
    } else if (Array.isArray(secondary.scale)) {
      label = `the "scale" option of ${ruleName}`;
    } else if (options.preset) {
      label = `preset "${options.preset}" on ${ruleName}`;
    } else {
      label = `the default scale (${ruleName} sets no scale)`;
    }
    const isDefault = sameValues(values, [...DEFAULT_SCALE]);
    if (isDefault && Array.isArray(secondary.scale)) {
      label += ', the default scale';
    }
    return { scale: { files: [], isDefault, label, source: Array.isArray(secondary.scale) || Array.isArray(secondary.customScale) ? 'explicit' : options.preset ? 'preset' : 'default', values, warnings: [] } };
  }

  const inference = resolveAutoScale({
    baseFontSize,
    cwd,
    fallbackPreset: options.preset || undefined,
    root: sample ? sample.root : undefined,
    scaleSources: options.scaleSources,
    sourceTokenPattern: options.tokenPatternExplicit ? options.tokenPattern : null,
    tailwindConfigPath: options.tailwindConfigPath ? path.resolve(cwd, options.tailwindConfigPath) : null,
    tokenPattern: options.tokenPatternExplicit ? options.tokenPattern : DEFAULT_AUTO_TOKEN_PATTERN,
  });
  const values = normalizeScale(inference.scale || [], baseFontSize);
  const files = (inference.files || []).map((file) => relative(cwd, path.resolve(process.cwd(), file)));
  const fileList = files.length > 0 ? `: ${files.join(', ')}` : '';
  const labels = {
    fallback: `scale "auto" on ${ruleName} found no spacing tokens, so it falls back to preset "${inference.preset}"`,
    rhythmguardrc: `scale "auto" on ${ruleName}, from the .rhythmguardrc.json token sources${fileList}`,
    scaleSources: `scale "auto" on ${ruleName}, from scaleSources${fileList}`,
    stylesheet: `scale "auto" on ${ruleName}, from the spacing tokens in ${sample ? sample.relative : 'the linted stylesheet'} (each stylesheet's own tokens)`,
    tailwind: `scale "auto" on ${ruleName}, from the Tailwind config${fileList}`,
    'token-package': `scale "auto" on ${ruleName}, from an installed token package${fileList}`,
  };
  let label = labels[inference.source] || `scale "auto" on ${ruleName} (${inference.source})`;
  if (inference.source === 'fallback' && inference.rejected) {
    label = `scale "auto" on ${ruleName}: the spacing tokens found do not form a spacing scale (${inference.rejected.reasons.join(', ')}), so it falls back to preset "${inference.preset}"`;
  }
  return {
    scale: {
      files,
      isDefault: inference.source === 'fallback' && sameValues(values, [...DEFAULT_SCALE]),
      label,
      source: inference.source,
      values,
      warnings: Array.from(new Set(inference.warnings || [])),
    },
  };
}

/** The sample stylesheet's PostCSS root, parsed as the lint would parse it. */
function parseSample(cwd, file, customSyntax) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let parser = postcss.parse;
  const syntaxName = customSyntax || (file.endsWith('.scss') ? 'postcss-scss' : null);
  if (syntaxName) {
    try {
      // The project's own syntax package, as Stylelint loads it.
      const syntax = require(require.resolve(syntaxName, { paths: [cwd, __dirname] }));
      parser = (syntax && (syntax.parse || (syntax.default && syntax.default.parse))) || parser;
    } catch {
      // Not installed: the custom syntax check reports it.
    }
  }
  try {
    return { relative: relative(cwd, file), root: parser(source, { from: file }) };
  } catch {
    return null;
  }
}

async function checkStylelint(ctx) {
  const { cwd, fail, pass, project, skip, warn } = ctx;
  const stylelintPkg = findPackage('stylelint', cwd);
  const pluginPkg = findPackage(PLUGIN_NAME, cwd);
  const isPluginItself = (readPackageJson(cwd) || {}).name === PLUGIN_NAME;
  const installLine = stylelintInstallLine({ scss: project.scssFiles.length > 0 });

  if (!stylelintPkg) {
    fail('stylelint-installed', 'stylelint not installed', `Run: ${installLine}`);
  } else {
    pass('stylelint-installed', `stylelint installed (v${stylelintPkg.manifest.version})`);
  }

  if (stylelintPkg) {
    // The installed plugin's own range, which npm checks; this package's when it is not installed.
    const peerRange = ((pluginPkg && pluginPkg.manifest.peerDependencies) || ownPackage.peerDependencies).stylelint;
    const inRange = satisfiesRange(stylelintPkg.manifest.version, peerRange);
    if (inRange) {
      pass('stylelint-peer-range', `stylelint ${stylelintPkg.manifest.version} is in the plugin's peer range (${peerRange})`);
    } else {
      fail(
        'stylelint-peer-range',
        `stylelint ${stylelintPkg.manifest.version} is outside the plugin's peer range (${peerRange})`,
        `Run: ${installLine}`,
      );
    }
  }

  if (isPluginItself) {
    pass('plugin-installed', `${PLUGIN_NAME} is this project`);
  } else if (!pluginPkg) {
    fail('plugin-installed', `${PLUGIN_NAME} not installed`, `Run: ${installLine}`);
  } else {
    pass('plugin-installed', `${PLUGIN_NAME} installed (v${pluginPkg.manifest.version})`);
  }

  if (!stylelintPkg) {
    skip('stylelint-config', 'Stylelint config not loaded (Stylelint is not installed)');
    return;
  }

  let stylelint;
  try {
    stylelint = await importPackage(stylelintPkg);
  } catch (error) {
    fail('stylelint-config', `stylelint could not be loaded: ${firstLine(error)}`, `Run: ${installLine}`);
    return;
  }
  if (!stylelint || typeof stylelint.resolveConfig !== 'function' || typeof stylelint.lint !== 'function') {
    fail('stylelint-config', `stylelint ${stylelintPkg.manifest.version} has no resolveConfig API`, `Run: ${installLine}`);
    return;
  }

  const located = locateConfig(cwd, STYLELINT_CONFIG_FILES, 'stylelint');
  const sampleFile = project.cssFiles[0] || path.join(cwd, 'index.css');
  let config;
  try {
    config = await stylelint.resolveConfig(sampleFile, { cwd });
  } catch (error) {
    fail('stylelint-config', `Stylelint config does not load: ${firstLine(error)}`, fixForConfigError(firstLine(error), project));
    return;
  }
  if (!config) {
    fail('stylelint-config', 'no Stylelint config found', 'Run: npx rhythmguard init');
    return;
  }
  pass('stylelint-config', `Stylelint config loads${located ? ` (${located.label})` : ''}, with every extends and plugin resolved`);

  const rhythmguardRules = Object.keys(config.rules || {}).filter((name) => name.startsWith('rhythmguard/') && enabledRuleOptions(config.rules, name));
  if (rhythmguardRules.length === 0) {
    fail(
      'stylelint-rules',
      'Stylelint config enables no rhythmguard rule',
      'Add: "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]',
    );
  } else {
    pass('stylelint-rules', `Stylelint config enables ${rhythmguardRules.join(', ')}`);
  }

  checkCustomSyntax(ctx, config);
  await checkScssSyntax(ctx, stylelint);
  checkRuleOptions(ctx, config, rhythmguardRules);

  const sample = project.cssFiles.length > 0 ? parseSample(cwd, project.cssFiles[0], config.customSyntax) : null;
  const scaleRule = SCALE_RULES.find((name) => enabledRuleOptions(config.rules, name));
  if (scaleRule) {
    const resolved = resolveRuleScale({ cwd, ruleName: scaleRule, sample, secondary: enabledRuleOptions(config.rules, scaleRule) });
    if (resolved.error) {
      fail('scale', resolved.error, `Fix the "preset" option of ${scaleRule}`);
    } else {
      ctx.scale = resolved.scale;
      const message = `spacing scale ${formatScale(resolved.scale.values)}, from ${resolved.scale.label}`;
      if (resolved.scale.warnings.length > 0) {
        warn('scale', `${message}. ${resolved.scale.warnings.join(' ')}`, 'Fix the token sources named above');
      } else {
        pass('scale', message);
      }
    }
  } else {
    skip('scale', 'spacing scale not resolved (no use-scale or no-offscale-transform rule enabled)');
  }

  await lintOneStylesheet(ctx, stylelint);
}

function checkCustomSyntax({ cwd, fail, pass }, config) {
  if (typeof config.customSyntax !== 'string' || config.customSyntax.length === 0) {
    return;
  }
  const name = config.customSyntax;
  try {
    require.resolve(name, { paths: [cwd] });
    pass('custom-syntax', `custom syntax installed (${name})`);
  } catch {
    if (path.isAbsolute(name) && fs.existsSync(name)) {
      pass('custom-syntax', `custom syntax found (${name})`);
      return;
    }
    fail('custom-syntax', `custom syntax package not installed: ${name}`, `Run: npm install --save-dev ${name}`);
  }
}

/** SCSS files linted as plain CSS fail to parse: warn when a .scss file has no customSyntax. */
async function checkScssSyntax({ cwd, project, warn }, stylelint) {
  const scss = project.scssFiles[0];
  if (!scss) {
    return;
  }
  let config;
  try {
    config = await stylelint.resolveConfig(scss, { cwd });
  } catch {
    return;
  }
  if (config && !config.customSyntax) {
    warn(
      'scss-syntax',
      `${project.scssFiles.length} .scss file${project.scssFiles.length === 1 ? '' : 's'} and no customSyntax for ${relative(cwd, scss)}; Stylelint parses SCSS as CSS`,
      'Add "customSyntax": "postcss-scss" to the Stylelint config and run: npm install --save-dev postcss-scss',
    );
  }
}

/** Options that name a regex or a file, read from the resolved config rather than its text. */
function checkRuleOptions({ cwd, fail, pass }, config, ruleNames) {
  for (const ruleName of ruleNames) {
    const secondary = enabledRuleOptions(config.rules, ruleName);
    if (typeof secondary.tokenPattern === 'string') {
      try {
        new RegExp(secondary.tokenPattern);
        pass('token-pattern', `token pattern valid on ${ruleName} (${secondary.tokenPattern})`);
      } catch {
        fail('token-pattern', `token pattern invalid on ${ruleName}: ${secondary.tokenPattern}`, 'Fix the regex in the tokenPattern option');
      }
    }
    if (typeof secondary.tailwindConfigPath === 'string' && secondary.tailwindConfigPath.length > 0) {
      if (fs.existsSync(path.resolve(cwd, secondary.tailwindConfigPath))) {
        pass('tailwind-config', `tailwind config found for ${ruleName} (${secondary.tailwindConfigPath})`);
      } else {
        fail(
          'tailwind-config',
          `tailwind config not found at ${secondary.tailwindConfigPath} (${ruleName})`,
          'Update tailwindConfigPath or remove tokenMapFromTailwindSpacing',
        );
      }
    }
    for (const entry of Array.isArray(secondary.scaleSources) ? secondary.scaleSources : []) {
      const { error, source } = normalizeTokenSourceEntry(entry, cwd);
      if (error) {
        fail('scale-sources', `scaleSources entry invalid on ${ruleName}: ${error}`, 'Use paths or { "path": "...", "format": "..." } entries');
      } else if (!fs.existsSync(path.resolve(source.baseDir, source.path))) {
        fail('scale-sources', `scaleSources file not found on ${ruleName}: ${source.path}`, 'Update scaleSources or create the token file');
      }
    }
  }
}

async function lintOneStylesheet({ cwd, fail, pass, project, skip, warn }, stylelint) {
  if (project.cssFiles.length === 0) {
    skip('stylelint-lint', 'Stylelint lint skipped (no stylesheet found)');
    return;
  }
  for (const file of project.cssFiles.slice(0, MAX_LINT_ATTEMPTS)) {
    let result;
    try {
      // allowEmptyInput: an ignored file is a result to move past, not an error.
      result = (await stylelint.lint({ allowEmptyInput: true, cwd, files: [file] })).results[0];
    } catch (error) {
      fail('stylelint-lint', `Stylelint could not lint ${relative(cwd, file)}: ${firstLine(error)}`, fixForConfigError(firstLine(error), project));
      return;
    }
    if (!result || result.ignored) {
      continue;
    }
    const name = relative(cwd, file);
    const invalid = (result.invalidOptionWarnings || []).map((warning) => warning.text);
    if (invalid.length > 0) {
      fail('stylelint-lint', `Stylelint rejects rule options: ${invalid.join(' ')}`, 'Fix the options it names; the rules do not run until then');
      return;
    }
    const syntaxError = (result.warnings || []).find((warning) => warning.rule === 'CssSyntaxError');
    if (syntaxError) {
      warn(
        'stylelint-lint',
        `Stylelint could not parse ${name}: ${syntaxError.text}`,
        file.endsWith('.scss') ? 'Add "customSyntax": "postcss-scss" to the Stylelint config' : 'Fix the syntax error, or set the customSyntax this file needs',
      );
      return;
    }
    const count = (result.warnings || []).filter((warning) => String(warning.rule || '').startsWith('rhythmguard/')).length;
    pass('stylelint-lint', `Stylelint linted ${name} with this config (${count} rhythmguard finding${count === 1 ? '' : 's'})`);
    return;
  }
  skip('stylelint-lint', 'Stylelint lint skipped (every stylesheet tried is ignored by the config)');
}

// --- ESLint -------------------------------------------------------------------

/** The options of `tailwind-class-use-scale` in a computed config, under whatever prefix the plugin is registered. */
function eslintRuleEntry(config) {
  for (const [name, value] of Object.entries((config && config.rules) || {})) {
    if (name !== ESLINT_RULE && !name.endsWith(`/${ESLINT_RULE}`)) {
      continue;
    }
    const severity = Array.isArray(value) ? value[0] : value;
    if (severity === 0 || severity === 'off') {
      continue;
    }
    const option = Array.isArray(value) && value[1] && typeof value[1] === 'object' ? value[1] : {};
    return { name, option };
  }
  return null;
}

async function checkEslint(ctx, { required }) {
  const { cwd, fail, pass, project, skip, warn } = ctx;
  const located = locateConfig(cwd, ESLINT_CONFIG_FILES, 'eslintConfig');
  const referencesRhythmguard = Boolean(located && located.content.includes('rhythmguard'));
  // Outside an ESLint-only setup, a broken ESLint config is ours to report only when it uses Rhythmguard.
  const ours = required || referencesRhythmguard;
  const eslintPkg = findPackage('eslint', cwd);
  const installLine = eslintInstallLine({ typescript: project.typescript });

  if (!eslintPkg) {
    if (required) {
      fail('eslint-installed', 'eslint not installed', `Run: ${installLine}`);
    } else {
      skip('eslint-installed', `ESLint checks skipped (${located ? 'ESLint is not installed' : 'no ESLint config'})`);
    }
    return;
  }
  if (!located && !required) {
    skip('eslint-installed', 'ESLint checks skipped (no ESLint config)');
    return;
  }
  pass('eslint-installed', `eslint installed (v${eslintPkg.manifest.version})`);
  if (required && !findPackage(ESLINT_PLUGIN_NAME, cwd) && !referencesRhythmguard) {
    fail('eslint-plugin', `${ESLINT_PLUGIN_NAME} not installed`, `Run: ${installLine}`);
  }

  let linter;
  try {
    const mod = await importPackage(eslintPkg);
    const ESLint = typeof mod.loadESLint === 'function' ? await mod.loadESLint({ cwd }) : mod.ESLint;
    linter = new ESLint({ cwd });
  } catch (error) {
    (ours ? fail : warn)('eslint-config', `ESLint could not be loaded: ${firstLine(error)}`, `Run: ${installLine}`);
    return;
  }

  const candidates = [
    ...project.classFiles.slice(0, 1),
    path.join(cwd, 'src', 'index.tsx'),
    path.join(cwd, 'src', 'index.jsx'),
    path.join(cwd, 'src', 'index.js'),
  ];
  let found = null;
  let anyConfig = false;
  try {
    for (const file of candidates) {
      const config = await linter.calculateConfigForFile(file);
      anyConfig = anyConfig || Boolean(config);
      const entry = eslintRuleEntry(config);
      if (entry) {
        found = { ...entry, file };
        break;
      }
    }
  } catch (error) {
    const message = firstLine(error);
    const missingPlugin = message.includes(ESLINT_PLUGIN_NAME) || message.includes(PLUGIN_NAME);
    (ours ? fail : warn)(
      'eslint-config',
      `ESLint config does not load${located ? ` (${located.label})` : ''}: ${message}`,
      missingPlugin ? `Run: ${installLine}` : 'Fix the ESLint config; npx eslint stops on the same error',
    );
    return;
  }

  if (!found) {
    const message = anyConfig
      ? `ESLint config${located ? ` (${located.label})` : ''} does not enable ${ESLINT_RULE}`
      : 'no ESLint config applies to class-string files';
    if (required) {
      fail('eslint-rule', message, 'Add rhythmguard.configs.recommended from eslint-plugin-rhythmguard to the ESLint config');
    } else {
      skip('eslint-rule', `${message}; class strings are not checked by ESLint`);
    }
    return;
  }
  pass('eslint-config', `ESLint config loads${located ? ` (${located.label})` : ''} and enables ${found.name} for ${relative(cwd, found.file)}`);

  await lintOneClassFile(ctx, linter, found.name);
  compareEslintScale(ctx, found);
}

/** Run ESLint on one class-string file, as `npx eslint .` would, to prove the rule runs. */
async function lintOneClassFile({ cwd, fail, pass, project, skip, warn }, linter, ruleName) {
  for (const file of project.classFiles.slice(0, MAX_LINT_ATTEMPTS)) {
    try {
      if (await linter.isPathIgnored(file) || !eslintRuleEntry(await linter.calculateConfigForFile(file))) {
        continue;
      }
      const [result] = await linter.lintFiles([file]);
      const name = relative(cwd, file);
      const fatal = ((result && result.messages) || []).find((message) => message.fatal);
      if (fatal) {
        warn('eslint-lint', `ESLint could not parse ${name}: ${fatal.message}`, 'Configure a parser for this file type in the ESLint config');
        return;
      }
      const count = ((result && result.messages) || []).filter((message) => message.ruleId === ruleName).length;
      pass('eslint-lint', `ESLint linted ${name} with this config (${count} ${ESLINT_RULE} finding${count === 1 ? '' : 's'})`);
      return;
    } catch (error) {
      fail('eslint-lint', `ESLint could not lint ${relative(cwd, file)}: ${firstLine(error)}`, 'Fix the ESLint config; npx eslint stops on the same error');
      return;
    }
  }
  skip('eslint-lint', `ESLint lint skipped (no class-string file found that ${ESLINT_RULE} applies to)`);
}

/**
 * The scale the ESLint rule checks, compared with the stylesheet scale. With
 * no `scale`, the rule checks Tailwind's default ladder, which is what the
 * audit pairs with the default stylesheet scale; anything else should match.
 */
function compareEslintScale(ctx, found) {
  const { pass, warn } = ctx;
  const analyzer = createTailwindClassAnalyzer(found.option);
  const values = [...analyzer.scalePx];
  const defaultLadder = !Array.isArray(found.option.scale);
  const label = defaultLadder ? TAILWIND_SCALE_NAME : `the "scale" option of ${found.name}`;
  ctx.eslintScale = { files: [], isDefault: defaultLadder, label, source: defaultLadder ? 'tailwind-default' : 'explicit', values, warnings: [] };
  const message = `class-string scale ${defaultLadder && values.length > 12 ? `${values.slice(0, 12).join(', ')}, ... ${values[values.length - 1]}px` : formatScale(values)}, from ${label}`;

  const stylesheet = ctx.scale;
  if (!stylesheet) {
    pass('eslint-scale', message);
    return;
  }
  if (sameValues(values, stylesheet.values)) {
    pass('eslint-scale', `${message}, the same scale Stylelint checks`);
    return;
  }
  if (defaultLadder && (stylesheet.isDefault || stylesheet.source === 'fallback')) {
    pass('eslint-scale', `${message}; the stylesheet scale is the default, so class strings use Tailwind's ladder, as the audit does`);
    return;
  }
  const onlyStylelint = stylesheet.values.filter((value) => !values.includes(value));
  const onlyEslint = values.filter((value) => !stylesheet.values.includes(value));
  const differences = [
    onlyStylelint.length > 0 ? `only in Stylelint: ${listDifference(onlyStylelint)}` : '',
    onlyEslint.length > 0 ? `only in ESLint: ${listDifference(onlyEslint)}` : '',
  ].filter(Boolean).join('; ');
  warn(
    'eslint-scale',
    `${message}, which is not the stylesheet scale (${differences})`,
    `Set "scale": [${stylesheet.values.join(', ')}] on ${found.name} so class strings and stylesheets are checked against one scale`,
  );
}

// --- .rhythmguardrc.json --------------------------------------------------------

function checkRhythmguardConfig(ctx) {
  const { cwd, fail, pass, skip } = ctx;
  const configPath = path.join(cwd, '.rhythmguardrc.json');
  if (!fs.existsSync(configPath)) {
    skip('rc', 'rhythmguard config check skipped (.rhythmguardrc.json not found)');
    return;
  }

  let parsed;
  try {
    parsed = readJsonFile(configPath);
  } catch {
    fail('rc', '.rhythmguardrc.json is not valid JSON', 'Fix or remove .rhythmguardrc.json');
    return;
  }

  // Validate with the audit's own loader, so doctor passes exactly the files
  // `rhythmguard audit` accepts. The "audit" section is optional there too.
  // Decisions are checked on their own, so an error in one section does not
  // hide an error in the other.
  let configResult = null;
  let options = null;
  try {
    configResult = loadAuditConfig({ configPath });
    const applied = applyAuditConfig(
      { ...createDefaultAuditOptions(), cliOptions: new Set() },
      { ...configResult, decisions: undefined },
    );
    resolveIgnorePatterns({ ...applied, ignorePath: ignorePathFor(cwd, applied.ignorePath) });
    options = applied;
    pass('rc-audit', '.rhythmguardrc.json audit config valid');
  } catch (err) {
    fail(
      'rc-audit',
      `.rhythmguardrc.json audit config invalid: ${err.message}`,
      'Fix the "audit" section; rhythmguard audit stops on the same error',
    );
  }

  checkRhythmguardDecisions(ctx, parsed, options ? options.baseFontSize : undefined);

  const audit = configResult ? configResult.audit : {};
  if (options) {
    checkRhythmguardTokenSources(ctx, audit, path.dirname(configPath));
    checkRhythmguardMotionConfig(ctx, audit);
  }
  checkRhythmguardBaseline(ctx, audit);
}

// The ignore file the audit would read from cwd; the default one only when present.
function ignorePathFor(cwd, ignorePath) {
  if (!ignorePath) {
    return ignorePath;
  }
  const resolved = path.resolve(cwd, ignorePath);
  return ignorePath === DEFAULT_IGNORE_PATH && !fs.existsSync(resolved) ? null : resolved;
}

function checkRhythmguardDecisions({ fail, pass, skip }, config, baseFontSize) {
  const raw = config && typeof config === 'object' && !Array.isArray(config) ? config.decisions : undefined;
  if (raw === undefined || raw === null) {
    skip('rc-decisions', 'decisions check skipped (not configured)');
    return;
  }

  try {
    const decisions = normalizeDecisions(raw, baseFontSize === undefined ? {} : { baseFontSize });
    pass('rc-decisions', `.rhythmguardrc.json decisions valid (${decisions.length} decision${decisions.length === 1 ? '' : 's'})`);
  } catch (err) {
    fail(
      'rc-decisions',
      `.rhythmguardrc.json decisions invalid: ${err.message}`,
      'Fix the "decisions" section; rhythmguard audit and the Stylelint rules read the same entries',
    );
  }
}

function checkRhythmguardTokenSources(ctx, audit, baseDir) {
  const { fail, pass, skip } = ctx;
  if (audit.tokenSources === undefined) {
    skip('rc-token-sources', 'token source config check skipped (not configured)');
    return;
  }

  if (!Array.isArray(audit.tokenSources)) {
    fail('rc-token-sources', 'audit.tokenSources must be an array', 'Use strings or { "path": "...", "format": "..." } entries');
    return;
  }

  for (const source of audit.tokenSources) {
    const sourcePath = typeof source === 'string' ? source : source && source.path;
    const format = typeof source === 'string' ? 'auto' : source && source.format;

    if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
      fail('rc-token-sources', 'token source entry missing path', 'Use strings or objects with a non-empty path');
      continue;
    }

    try {
      normalizeTokenSourceFormat(format || 'auto');
    } catch {
      fail('rc-token-sources', `token source format invalid for ${sourcePath}`, 'Use auto, css, flat-json, style-dictionary, or dtcg');
    }

    if (fs.existsSync(path.resolve(baseDir, sourcePath))) {
      pass('rc-token-sources', `token source found (${sourcePath})`);
      warnAboutTokenSource(ctx, source, baseDir);
    } else {
      fail('rc-token-sources', `token source not found (${sourcePath})`, 'Update audit.tokenSources or create the token file');
    }
  }
}

/**
 * Read a token source the way the audit reads it for the spacing scale, and
 * pass on what the audit would warn about: a file that does not parse, skipped
 * tokens, or no spacing tokens at all (issue #163). Warnings, not failures.
 */
function warnAboutTokenSource({ warn }, entry, baseDir) {
  const { source } = normalizeTokenSourceEntry(entry, baseDir);
  if (!source) {
    return;
  }
  const parsed = parseTokenSources({ sources: [source], tokenKind: 'spacing', warnWhenEmpty: true });
  for (const message of parsed.warnings) {
    warn('rc-token-sources', message);
  }
}

function checkRhythmguardMotionConfig({ fail, pass, skip }, audit) {
  if (audit.includeMotion === undefined) {
    skip('rc-motion', 'motion audit check skipped (not configured)');
    return;
  }

  if (typeof audit.includeMotion === 'boolean') {
    pass('rc-motion', `motion audit config valid (${audit.includeMotion})`);
  } else {
    fail('rc-motion', 'audit.includeMotion must be a boolean', 'Use true or false');
  }
}

function checkRhythmguardBaseline({ cwd, fail, pass, skip }, audit) {
  const baselinePath = path.resolve(cwd, audit.baseline || '.rhythmguard-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    skip('rc-baseline', 'baseline freshness check skipped (baseline not found)');
    return;
  }

  try {
    const baseline = readJsonFile(baselinePath);
    if (!Array.isArray(baseline.findings)) {
      fail('rc-baseline', 'baseline file does not include findings array', 'Regenerate it with rhythmguard audit --write-baseline');
      return;
    }
    pass('rc-baseline', `baseline file readable (${relative(cwd, baselinePath)})`);
  } catch {
    fail('rc-baseline', 'baseline file is not valid JSON', 'Regenerate it with rhythmguard audit --write-baseline');
  }
}

// --- Entry points -----------------------------------------------------------------

/**
 * An ESLint-only setup: no Stylelint installed or configured, and Rhythmguard
 * reached through ESLint (the ESLint package installed, or named in the
 * ESLint config).
 */
function isEslintOnly(cwd) {
  if (findPackage('stylelint', cwd) || locateConfig(cwd, STYLELINT_CONFIG_FILES, 'stylelint')) {
    return false;
  }
  if (findPackage(ESLINT_PLUGIN_NAME, cwd)) {
    return true;
  }
  const eslintConfig = locateConfig(cwd, ESLINT_CONFIG_FILES, 'eslintConfig');
  return Boolean(eslintConfig && eslintConfig.content.includes('rhythmguard'));
}

/**
 * Check the Rhythmguard setup in `cwd` (default: the process's working
 * directory). Resolves to `{ ok, setup, issues, warnings, checks, scale,
 * eslintScale }`; `ok` is false when any check failed. Loads the project's own
 * Stylelint and ESLint, so it runs their configs as their CLIs would; it makes
 * no network request.
 */
async function runDoctor({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const { checks, fail, pass, skip, warn } = createChecks();
  const ctx = { cwd: root, eslintScale: null, fail, pass, project: scanProject(root), scale: null, skip, warn };

  const setup = isEslintOnly(root) ? 'eslint-only' : 'stylelint';
  if (setup === 'eslint-only') {
    await checkEslint(ctx, { required: true });
    skip('stylelint-skipped', 'Stylelint checks skipped (ESLint-only setup: no Stylelint installed or configured)');
  } else {
    await checkStylelint(ctx);
    await checkEslint(ctx, { required: false });
  }
  checkRhythmguardConfig(ctx);

  const issues = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  return {
    checks,
    cwd: root,
    eslintScale: ctx.eslintScale,
    issues,
    ok: issues === 0,
    scale: ctx.scale,
    setup,
    warnings,
  };
}

const SYMBOLS = { fail: '✗', pass: '✓', skip: '-', warn: '!' };

function checkLines(check) {
  const lines = [`${SYMBOLS[check.status] || '-'} ${check.message}`];
  if (check.fix && (check.status === 'fail' || check.status === 'warn')) {
    lines.push(`  → ${check.fix}`);
  }
  return lines;
}

function countsLine(issues, warnings) {
  const warningNote = warnings > 0 ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : '';
  return issues === 0 ? `All checks passed${warningNote}.` : `${issues} issue${issues === 1 ? '' : 's'} found${warningNote}.`;
}

/** The text `rhythmguard doctor` prints for a result. */
function formatDoctorReport(result) {
  return [
    '',
    'Rhythmguard Doctor',
    '',
    ...result.checks.flatMap(checkLines),
    '',
    countsLine(result.issues, result.warnings),
    '',
    '',
  ].join('\n');
}

/**
 * A short summary for another command to print (quickstart): the count line,
 * then each failed check with its fix. Takes a runDoctor result or its checks.
 */
function doctorSummary(resultOrChecks) {
  const checks = Array.isArray(resultOrChecks) ? resultOrChecks : (resultOrChecks && resultOrChecks.checks) || [];
  const failed = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn').length;
  const scale = checks.find((check) => check.id === 'scale' && check.status !== 'fail');
  return [
    `Setup check: ${countsLine(failed.length, warnings)}`,
    ...(scale && failed.length === 0 ? [`  ${scale.message}`] : []),
    ...failed.flatMap((check) => checkLines(check).map((line) => `  ${line}`)),
  ].join('\n');
}

async function run(argv = process.argv.slice(3)) {
  // Doctor takes no arguments; --help prints the usage, anything else is refused (#286).
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      return;
    }
    process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runDoctor({ cwd: process.cwd() });
    process.stdout.write(formatDoctorReport(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Doctor could not finish: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { HELP, doctorSummary, formatDoctorReport, run, runDoctor, satisfiesRange };

if (require.main === module) {
  run();
}
