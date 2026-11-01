'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { applyAuditConfig, loadAuditConfig, resolveIgnorePatterns } = require('../audit/config');
const { createDefaultAuditOptions } = require('../audit/shared');
const { normalizeDecisions } = require('../core/decisions');
const { readJsonFile } = require('../core/json');
const { normalizeTokenSourceEntry } = require('../core/token-source-entries');
const { normalizeTokenSourceFormat, parseTokenSources } = require('../core/token-sources');

const HELP = `Usage: rhythmguard doctor

Validate the Rhythmguard setup in the current directory: Stylelint, its config,
the rules it references, .rhythmguardrc.json, token sources and the baseline.
In a project that uses Rhythmguard through ESLint only (no Stylelint), checks
ESLint and its config instead of Stylelint's. Exits 1 when a check fails.

Options:
  --help        Show this help message
`;

const cwd = process.cwd();
let issues = 0;

function pass(msg) {
  process.stdout.write(`✓ ${msg}\n`);
}

function fail(msg, fix) {
  issues++;
  process.stdout.write(`✗ ${msg}\n`);
  if (fix) {
    process.stdout.write(`  → ${fix}\n`);
  }
}

function skip(msg) {
  process.stdout.write(`- ${msg}\n`);
}

let warnings = 0;

// Worth knowing, but not a failure: the exit code does not change.
function warn(msg) {
  warnings++;
  process.stdout.write(`! ${msg}\n`);
}

function installedVersion(name) {
  try {
    return require(require.resolve(`${name}/package.json`, { paths: [cwd] })).version;
  } catch {
    return null;
  }
}

// Check 1: Stylelint installed
function checkStylelint() {
  const version = installedVersion('stylelint');
  if (version) {
    pass(`stylelint installed (v${version})`);
    return true;
  }
  fail(
    'stylelint not installed',
    'Run: npm install --save-dev stylelint',
  );
  return false;
}

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

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

// The first config file present, or the package.json key; { label, path, content } or null.
function locateConfig(files, packageKey) {
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      return { content: fs.readFileSync(fullPath, 'utf8'), label: file, path: fullPath };
    }
  }
  const pkg = readPackageJson();
  if (pkg && pkg[packageKey]) {
    return {
      content: JSON.stringify(pkg[packageKey]),
      label: `package.json ${packageKey} key`,
      path: path.join(cwd, 'package.json'),
    };
  }
  return null;
}

// Check 2: Config found
function findConfig() {
  const found = locateConfig(STYLELINT_CONFIG_FILES, 'stylelint');
  if (found) {
    pass(`config found (${found.label})`);
    return found.path;
  }

  fail(
    'no Stylelint config found',
    'Run: npx rhythmguard init',
  );
  return null;
}

// Check 3: Config references Rhythmguard
function checkConfigReferences(configPath) {
  if (!configPath) {
    skip('config reference check skipped (no config)');
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');

    if (content.includes('rhythmguard')) {
      pass('config references rhythmguard');
      return content;
    }

    // Check package.json stylelint key
    if (configPath.endsWith('package.json')) {
      const pkg = JSON.parse(content);
      const stylelintConfig = JSON.stringify(pkg.stylelint || {});
      if (stylelintConfig.includes('rhythmguard')) {
        pass('config references rhythmguard');
        return stylelintConfig;
      }
    }

    fail(
      'config does not reference rhythmguard',
      'Add: "extends": ["stylelint-plugin-rhythmguard/configs/recommended"]',
    );
    return content;
  } catch {
    fail(
      'could not read config file',
      `Check permissions on ${configPath}`,
    );
    return null;
  }
}

// Check 4: Token pattern valid
function checkTokenPattern(configContent) {
  if (!configContent) {
    skip('token pattern check skipped (no config content)');
    return;
  }

  const patternMatch = configContent.match(
    /tokenPattern['":\s]+['"]([^'"]+)['"]/,
  );

  if (!patternMatch) {
    skip('token pattern check skipped (not configured)');
    return;
  }

  try {
    new RegExp(patternMatch[1]);
    pass(`token pattern valid (${patternMatch[1]})`);
  } catch {
    fail(
      `token pattern invalid: ${patternMatch[1]}`,
      'Fix the regex in tokenPattern option',
    );
  }
}

// Check 5: Tailwind config exists
function checkTailwindConfig(configContent) {
  if (!configContent) {
    skip('tailwind config check skipped (no config content)');
    return;
  }

  const tailwindPathMatch = configContent.match(
    /tailwindConfigPath['":\s]+['"]([^'"]+)['"]/,
  );

  if (!tailwindPathMatch) {
    skip('tailwind config check skipped (not configured)');
    return;
  }

  const tailwindPath = path.resolve(cwd, tailwindPathMatch[1]);
  if (fs.existsSync(tailwindPath)) {
    pass(`tailwind config found (${tailwindPathMatch[1]})`);
  } else {
    fail(
      `tailwind config not found at ${tailwindPathMatch[1]}`,
      'Update tailwindConfigPath or remove tokenMapFromTailwindSpacing',
    );
  }
}

// Check 6: Custom syntax installed
function checkCustomSyntax(configContent) {
  if (!configContent) {
    skip('custom syntax check skipped (no config content)');
    return;
  }

  const syntaxMatch = configContent.match(
    /customSyntax['":\s]+['"]([^'"]+)['"]/,
  );

  if (!syntaxMatch) {
    skip('custom syntax check skipped (not configured)');
    return;
  }

  const pkg = syntaxMatch[1];
  try {
    require.resolve(pkg, { paths: [cwd] });
    pass(`custom syntax installed (${pkg})`);
  } catch {
    fail(
      `custom syntax package not installed: ${pkg}`,
      `Run: npm install --save-dev ${pkg}`,
    );
  }
}

function checkRhythmguardConfig() {
  const configPath = path.join(cwd, '.rhythmguardrc.json');
  if (!fs.existsSync(configPath)) {
    skip('rhythmguard config check skipped (.rhythmguardrc.json not found)');
    return;
  }

  let parsed;
  try {
    parsed = readJsonFile(configPath);
  } catch {
    fail('.rhythmguardrc.json is not valid JSON', 'Fix or remove .rhythmguardrc.json');
    return;
  }

  // Validate with the audit's own loader, so doctor passes exactly the files
  // `rhythmguard audit` accepts. The "audit" section is optional there too.
  // Decisions are checked on their own, so an error in one section does not
  // hide an error in the other.
  let configResult = null;
  let options = null;
  try {
    configResult = loadAuditConfig({});
    const applied = applyAuditConfig(
      { ...createDefaultAuditOptions(), cliOptions: new Set() },
      { ...configResult, decisions: undefined },
    );
    resolveIgnorePatterns(applied);
    options = applied;
    pass('.rhythmguardrc.json audit config valid');
  } catch (err) {
    fail(
      `.rhythmguardrc.json audit config invalid: ${err.message}`,
      'Fix the "audit" section; rhythmguard audit stops on the same error',
    );
  }

  checkRhythmguardDecisions(parsed, options ? options.baseFontSize : undefined);

  const audit = configResult ? configResult.audit : {};
  if (options) {
    checkRhythmguardTokenSources(audit, path.dirname(configPath));
    checkRhythmguardMotionConfig(audit);
  }
  checkRhythmguardBaseline(audit);
}

function checkRhythmguardDecisions(config, baseFontSize) {
  const raw = config && typeof config === 'object' && !Array.isArray(config) ? config.decisions : undefined;
  if (raw === undefined || raw === null) {
    skip('decisions check skipped (not configured)');
    return;
  }

  try {
    const decisions = normalizeDecisions(raw, baseFontSize === undefined ? {} : { baseFontSize });
    pass(`.rhythmguardrc.json decisions valid (${decisions.length} decision${decisions.length === 1 ? '' : 's'})`);
  } catch (err) {
    fail(
      `.rhythmguardrc.json decisions invalid: ${err.message}`,
      'Fix the "decisions" section; rhythmguard audit and the Stylelint rules read the same entries',
    );
  }
}

function checkRhythmguardTokenSources(audit, baseDir) {
  if (audit.tokenSources === undefined) {
    skip('token source config check skipped (not configured)');
    return;
  }

  if (!Array.isArray(audit.tokenSources)) {
    fail('audit.tokenSources must be an array', 'Use strings or { "path": "...", "format": "..." } entries');
    return;
  }

  for (const source of audit.tokenSources) {
    const sourcePath = typeof source === 'string' ? source : source && source.path;
    const format = typeof source === 'string' ? 'auto' : source && source.format;

    if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
      fail('token source entry missing path', 'Use strings or objects with a non-empty path');
      continue;
    }

    try {
      normalizeTokenSourceFormat(format || 'auto');
    } catch {
      fail(`token source format invalid for ${sourcePath}`, 'Use auto, css, flat-json, style-dictionary, or dtcg');
    }

    if (fs.existsSync(path.resolve(baseDir, sourcePath))) {
      pass(`token source found (${sourcePath})`);
      warnAboutTokenSource(source, baseDir);
    } else {
      fail(`token source not found (${sourcePath})`, 'Update audit.tokenSources or create the token file');
    }
  }
}

/**
 * Read a token source the way the audit reads it for the spacing scale, and
 * pass on what the audit would warn about: a file that does not parse, skipped
 * tokens, or no spacing tokens at all (issue #163). Warnings, not failures.
 */
function warnAboutTokenSource(entry, baseDir) {
  const { source } = normalizeTokenSourceEntry(entry, baseDir);
  if (!source) {
    return;
  }
  const parsed = parseTokenSources({ sources: [source], tokenKind: 'spacing', warnWhenEmpty: true });
  for (const message of parsed.warnings) {
    warn(message);
  }
}

function checkRhythmguardMotionConfig(audit) {
  if (audit.includeMotion === undefined) {
    skip('motion audit check skipped (not configured)');
    return;
  }

  if (typeof audit.includeMotion === 'boolean') {
    pass(`motion audit config valid (${audit.includeMotion})`);
  } else {
    fail('audit.includeMotion must be a boolean', 'Use true or false');
  }
}

function checkRhythmguardBaseline(audit) {
  const baselinePath = path.resolve(cwd, audit.baseline || '.rhythmguard-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    skip('baseline freshness check skipped (baseline not found)');
    return;
  }

  try {
    const baseline = readJsonFile(baselinePath);
    if (!Array.isArray(baseline.findings)) {
      fail('baseline file does not include findings array', 'Regenerate it with rhythmguard audit --write-baseline');
      return;
    }
    pass(`baseline file readable (${path.relative(cwd, baselinePath)})`);
  } catch {
    fail('baseline file is not valid JSON', 'Regenerate it with rhythmguard audit --write-baseline');
  }
}

// An ESLint-only setup: Rhythmguard's ESLint rules, no Stylelint installed or configured.
function eslintOnlyConfig() {
  if (installedVersion('stylelint') || locateConfig(STYLELINT_CONFIG_FILES, 'stylelint')) {
    return null;
  }
  const found = locateConfig(ESLINT_CONFIG_FILES, 'eslintConfig');
  return found && found.content.includes('rhythmguard') ? found : null;
}

function checkEslintSetup(config) {
  const version = installedVersion('eslint');
  if (version) {
    pass(`eslint installed (v${version})`);
  } else {
    fail('eslint not installed', 'Run: npm install --save-dev eslint');
  }
  pass(`ESLint config references rhythmguard (${config.label})`);
  skip('Stylelint checks skipped (ESLint-only setup)');
}

function run() {
  // Doctor takes no arguments; --help prints the usage, anything else is refused (#286).
  for (const arg of process.argv.slice(3)) {
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      return;
    }
    process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
    process.exit(1);
  }

  process.stdout.write('\nRhythmguard Doctor\n\n');

  const eslintConfig = eslintOnlyConfig();
  let stylelintOk = true;
  if (eslintConfig) {
    checkEslintSetup(eslintConfig);
  } else {
    stylelintOk = checkStylelint();
    const configPath = findConfig();
    const configContent = checkConfigReferences(configPath);
    checkTokenPattern(configContent);
    checkTailwindConfig(configContent);
    checkCustomSyntax(configContent);
  }
  checkRhythmguardConfig();

  process.stdout.write('\n');

  const warningNote = warnings > 0 ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : '';
  if (issues === 0) {
    process.stdout.write(`All checks passed${warningNote}.\n\n`);
  } else {
    process.stdout.write(
      `${issues} issue${issues === 1 ? '' : 's'} found${warningNote}.\n\n`,
    );
  }

  process.exit(stylelintOk && issues === 0 ? 0 : 1);
}

module.exports = { HELP, run };

if (require.main === module) {
  run();
}
