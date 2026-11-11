'use strict';

/**
 * Findings from stylesheets: run the rules through Stylelint's API, turn each
 * warning into a finding, and recover the CSS property at the warning position
 * from the source, since Stylelint reports positions rather than nodes.
 */
const path = require('node:path');
const {
  DEFAULT_AUDIT_TOKEN_PATTERN,
  formatPath,
  pluginPath,
} = require('../shared');
const { isScssFile, readSourceFromDisk } = require('./files');

let scssSyntaxCache;

/**
 * postcss-scss is an optional peer. Resolve it from the audited project first,
 * then from this package. Returns null when unavailable; SCSS files are then
 * counted as skipped instead of failing the audit.
 */
function resolveScssSyntax() {
  if (scssSyntaxCache !== undefined) {
    return scssSyntaxCache;
  }
  try {
    scssSyntaxCache = require.resolve('postcss-scss', { paths: [process.cwd(), __dirname] });
  } catch {
    scssSyntaxCache = null;
  }
  return scssSyntaxCache;
}

/**
 * Stylelint is an optional peer, so an ESLint-only project can reach this
 * without it. The `rhythmguard` package depends on it; this package's own
 * command then audits class strings only and counts the stylesheets as not
 * audited (null here), instead of failing on a module path.
 */
async function loadStylelint() {
  try {
    return (await import('stylelint')).default;
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && /'stylelint'/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function runStylelintAudit(cssFiles, options) {
  if (cssFiles.length === 0) {
    const empty = [];
    empty.scssFiles = 0;
    empty.scssSkipped = 0;
    empty.stylelintIgnored = 0;
    empty.stylelintMissing = 0;
    empty.unauditedFiles = [];
    return empty;
  }

  const stylelint = await loadStylelint();
  if (!stylelint) {
    // Found but not audited, like SCSS without postcss-scss: neither scanned nor clean.
    const missing = [];
    missing.scssFiles = 0;
    missing.scssSkipped = 0;
    missing.stylelintIgnored = 0;
    missing.stylelintMissing = cssFiles.length;
    missing.unauditedFiles = [...cssFiles];
    return missing;
  }
  const rules = {
    'rhythmguard/use-scale': [
      true,
      {
        decisions: false,
        baseFontSize: options.baseFontSize,
        checkMathBounds: options.checkMathBounds === true,
        scale: options.scale,
        // audit.scales adds the groups it names, each checked against its own scale.
        ...(options.scales ? { propertyGroups: ['spacing', ...Object.keys(options.scales)], scales: options.scales } : {}),
        severity: 'warning',
      },
    ],
    'rhythmguard/prefer-token': [
      true,
      {
        baseFontSize: options.baseFontSize,
        checkMathBounds: options.checkMathBounds === true,
        scale: options.scale,
        severity: 'warning',
        tokenMapFromCssCustomProperties: true,
        tokenPattern: DEFAULT_AUDIT_TOKEN_PATTERN,
        // The token definitions the audit resolved (token sources and the
        // stylesheets that declare tokens), so the message names the token
        // and its file instead of "No known token holds this value" (dx-08).
        ...(Array.isArray(options.tokenScaleSources) && options.tokenScaleSources.length > 0
          ? { scaleSources: options.tokenScaleSources }
          : {}),
      },
    ],
  };

  if (options.includeMotion) {
    rules['rhythmguard/use-motion-scale'] = [
      true,
      {
        severity: 'warning',
      },
    ];
  }

  const plainFiles = cssFiles.filter((file) => !isScssFile(file));
  const scssFiles = cssFiles.filter(isScssFile);
  const results = [];

  // A project's own .stylelintignore may exclude every file we pass; that is
  // a count to report, not a reason for the audit to throw.
  const lint = (files, config) => (options.readSource
    ? lintSources(stylelint, files, config, options.readSource)
    : stylelint.lint({ allowEmptyInput: true, config, files }).then((result) => result.results || []));

  if (plainFiles.length > 0) {
    results.push(...await lint(plainFiles, { plugins: [pluginPath], rules }));
  }

  let skippedScssFiles = [];
  if (scssFiles.length > 0) {
    const scssSyntax = resolveScssSyntax();
    if (scssSyntax) {
      results.push(...await lint(scssFiles, { customSyntax: scssSyntax, plugins: [pluginPath], rules }));
    } else {
      skippedScssFiles = scssFiles;
    }
  }

  assertNoInvalidOptions(results);

  // Stylelint returns no result at all for a file its ignore file excludes, so
  // a file passed in with no result back is one it ignored.
  const returned = new Set(results.map((result) => path.resolve(String(result.source))));
  const skipped = new Set(skippedScssFiles);
  const ignoredFiles = cssFiles.filter((file) => !skipped.has(file) && !returned.has(path.resolve(file)));

  results.scssFiles = scssFiles.length;
  results.scssSkipped = skippedScssFiles.length;
  results.stylelintIgnored = ignoredFiles.length;
  results.stylelintMissing = 0;
  // Neither kind was audited: they count as neither scanned nor clean.
  results.unauditedFiles = [...skippedScssFiles, ...ignoredFiles];
  return results;
}

/** Lints each file from the text the reader returns (the staged blob in a --staged run). */
async function lintSources(stylelint, files, config, readSource) {
  const results = [];
  for (const file of files) {
    let code;
    try {
      code = readSource(file);
    } catch {
      continue;
    }
    const result = await stylelint.lint({ allowEmptyInput: true, code, codeFilename: file, config });
    results.push(...(result.results || []));
  }
  return results;
}

/**
 * Stylelint does not run a rule whose options it rejects: it reports an
 * invalidOptionWarning and no findings for that rule. Read as findings, that is
 * a clean audit and a passing gate, so any rejected option stops the run.
 */
function assertNoInvalidOptions(results) {
  const texts = new Set();
  for (const result of results) {
    for (const warning of result.invalidOptionWarnings || []) {
      texts.add(warning.text);
    }
  }

  if (texts.size > 0) {
    throw new Error(`Stylelint rejected the audit's rule options, so no findings could be collected: ${Array.from(texts).join('; ')}`);
  }
}

/**
 * Stylelint reports a stylesheet it cannot parse as a single CssSyntaxError
 * warning and runs no rule on it. That is not drift: it is a file the audit
 * could not read, kept apart as a `parse-error` finding.
 */
function isParseErrorWarning(warning) {
  return warning.rule === 'CssSyntaxError';
}

function collectCssFindings(fileResults, readSource) {
  const findings = [];
  const sources = new Map();

  for (const fileResult of fileResults) {
    for (const warning of fileResult.warnings || []) {
      const text = warning.text || '';
      if (isParseErrorWarning(warning)) {
        findings.push({
          column: warning.column || 1,
          file: formatPath(fileResult.source),
          line: warning.line || 1,
          property: null,
          rule: warning.rule,
          text,
          type: 'parse-error',
          value: null,
        });
        continue;
      }
      const source = readSourceOnce(sources, fileResult.source, readSource);
      const { type, value } = classifyCssWarningText(text);

      findings.push({
        column: warning.column || 1,
        file: formatPath(fileResult.source),
        line: warning.line || 1,
        property: source === null
          ? null
          : findDeclarationProperty(source, warning.line || 1, warning.column || 1),
        rule: warning.rule || 'rhythmguard',
        text,
        type,
        value,
      });
    }
  }

  return findings;
}

function readSourceOnce(cache, filePath, readSource = readSourceFromDisk) {
  if (!filePath) {
    return null;
  }
  if (!cache.has(filePath)) {
    try {
      cache.set(filePath, readSource(filePath));
    } catch {
      cache.set(filePath, null);
    }
  }
  return cache.get(filePath);
}

const DECLARATION_BOUNDARY = new Set([';', '{', '}']);

const DECLARATION_HEAD_PATTERN = /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*(--[\w-]+|[a-zA-Z][\w-]*)\s*:/;

/**
 * Stylelint warnings carry a position but not the declaration node. Recover the
 * property by walking from the warning position back to the previous declaration
 * boundary and reading the `property:` head, skipping block and Sass line comments.
 * Sass interpolation is blanked first so `#{...}` braces do not act as boundaries. Returns null when the position is not
 * inside a declaration, for example inside an at-rule.
 */

function findDeclarationProperty(source, line, column) {
  const offset = positionToOffset(source, line, column);
  if (offset === null) {
    return null;
  }

  const text = source.replace(/#\{[^}]*\}/g, (match) => ' '.repeat(match.length));
  let start = offset;
  while (start > 0 && !DECLARATION_BOUNDARY.has(text[start - 1])) {
    start -= 1;
  }
  const backward = text.slice(start, offset).match(DECLARATION_HEAD_PATTERN);
  if (backward) {
    return backward[1];
  }

  let end = offset;
  while (end < text.length && !DECLARATION_BOUNDARY.has(text[end])) {
    end += 1;
  }
  const forward = text.slice(offset, end).match(DECLARATION_HEAD_PATTERN);
  return forward ? forward[1] : null;
}

function positionToOffset(source, line, column) {
  if (!Number.isInteger(line) || line < 1) {
    return null;
  }
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line) {
    const newline = source.indexOf('\n', offset);
    if (newline === -1) {
      return null;
    }
    offset = newline + 1;
    currentLine += 1;
  }
  const lineEnd = source.indexOf('\n', offset);
  const lineLength = (lineEnd === -1 ? source.length : lineEnd) - offset;
  return offset + Math.min(Math.max((column || 1) - 1, 0), lineLength);
}

/**
 * The message shapes the audit reads back into findings, each with the type
 * it becomes. Stylelint reports positions and text, not structured data, so
 * these follow the message templates in src/rules; the contract test
 * test/contracts/finding-messages.test.js calls every template and checks
 * that each one is parsed here or listed there as deliberately unclassified.
 */
const FINDING_PATTERNS = Object.freeze([
  ['motion-duration', /Unexpected (?:motion duration|negative motion duration) "([^"]+)"/],
  ['motion-easing', /Unexpected raw motion easing "([^"]+)"/],
  ['token-opportunity', /Unexpected raw (?:scale value|(?:clamp|min|max)\(\) (?:minimum|maximum|argument)) "([^"]+)"/],
  // Followed by the advice, so a forbidden negative or percentage, which names no scale step, is not read as off-scale.
  ['off-scale', /Unexpected (?:off-scale|transform translation) (?:value|(?:clamp|min|max)\(\) (?:minimum|maximum|argument)) "([^"]+)"(?: \([^)]*\))?\. Use /],
]);

/**
 * The finding type and value of one Stylelint warning. A message none of the
 * patterns reads (a root-level configuration report, or a template the audit
 * does not know) is `unclassified` with no value: it is still a finding, but
 * it is not counted as an off-scale value it may not be (cq-02).
 */
function classifyCssWarningText(text) {
  for (const [type, pattern] of FINDING_PATTERNS) {
    const match = String(text || '').match(pattern);
    if (match) {
      return { type, value: match[1] };
    }
  }
  return { type: 'unclassified', value: null };
}

/** The finding type of a warning's text (see classifyCssWarningText). */
function getCssFindingType(text) {
  return classifyCssWarningText(text).type;
}

/** The value a warning's text names, or null (see classifyCssWarningText). */
function getCssFindingValue(text) {
  return classifyCssWarningText(text).value;
}

module.exports = {
  FINDING_PATTERNS,
  classifyCssWarningText,
  collectCssFindings,
  findDeclarationProperty,
  getCssFindingType,
  getCssFindingValue,
  isParseErrorWarning,
  positionToOffset,
  readSourceOnce,
  resolveScssSyntax,
  runStylelintAudit,
};
