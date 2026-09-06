'use strict';

/**
 * Findings from stylesheets: run the rules through Stylelint's API, turn each
 * warning into a finding, and recover the CSS property at the warning position
 * from the source, since Stylelint reports positions rather than nodes.
 */
const fs = require('node:fs');
const {
  DEFAULT_AUDIT_TOKEN_PATTERN,
  formatPath,
  pluginPath,
} = require('../shared');
const { isScssFile } = require('./files');

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

async function runStylelintAudit(cssFiles, options) {
  if (cssFiles.length === 0) {
    const empty = [];
    empty.scssFiles = 0;
    empty.scssSkipped = 0;
    return empty;
  }

  const { default: stylelint } = await import('stylelint');
  const rules = {
    'rhythmguard/use-scale': [
      true,
      {
        baseFontSize: options.baseFontSize,
        scale: options.scale,
        severity: 'warning',
      },
    ],
    'rhythmguard/prefer-token': [
      true,
      {
        baseFontSize: options.baseFontSize,
        scale: options.scale,
        severity: 'warning',
        tokenMapFromCssCustomProperties: true,
        tokenPattern: DEFAULT_AUDIT_TOKEN_PATTERN,
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

  if (plainFiles.length > 0) {
    const result = await stylelint.lint({
      files: plainFiles,
      config: {
        plugins: [pluginPath],
        rules,
      },
    });
    results.push(...(result.results || []));
  }

  let scssSkipped = 0;
  if (scssFiles.length > 0) {
    const scssSyntax = resolveScssSyntax();
    if (scssSyntax) {
      const result = await stylelint.lint({
        files: scssFiles,
        config: {
          customSyntax: scssSyntax,
          plugins: [pluginPath],
          rules,
        },
      });
      results.push(...(result.results || []));
    } else {
      scssSkipped = scssFiles.length;
    }
  }

  results.scssFiles = scssFiles.length;
  results.scssSkipped = scssSkipped;
  return results;
}

function collectCssFindings(fileResults) {
  const findings = [];
  const sources = new Map();

  for (const fileResult of fileResults) {
    for (const warning of fileResult.warnings || []) {
      const text = warning.text || '';
      const source = readSourceOnce(sources, fileResult.source);
      const offScaleMatch = text.match(
        /Unexpected (?:off-scale value|transform translation value) "([^"]+)"/,
      );
      const tokenMatch = text.match(
        /Unexpected raw scale value "([^"]+)"/,
      );
      const motionDurationMatch = text.match(
        /Unexpected (?:motion duration|negative motion duration) "([^"]+)"/,
      );
      const motionEasingMatch = text.match(
        /Unexpected raw motion easing "([^"]+)"/,
      );

      findings.push({
        column: warning.column || 1,
        file: formatPath(fileResult.source),
        line: warning.line || 1,
        property: source === null
          ? null
          : findDeclarationProperty(source, warning.line || 1, warning.column || 1),
        rule: warning.rule || 'rhythmguard',
        text,
        type: getCssFindingType({ motionDurationMatch, motionEasingMatch, tokenMatch }),
        value: getCssFindingValue({
          motionDurationMatch,
          motionEasingMatch,
          offScaleMatch,
          tokenMatch,
        }),
      });
    }
  }

  return findings;
}

function readSourceOnce(cache, filePath) {
  if (!filePath) {
    return null;
  }
  if (!cache.has(filePath)) {
    try {
      cache.set(filePath, fs.readFileSync(filePath, 'utf8'));
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

function getCssFindingValue({
  motionDurationMatch,
  motionEasingMatch,
  offScaleMatch,
  tokenMatch,
}) {
  if (tokenMatch) {
    return tokenMatch[1];
  }

  if (offScaleMatch) {
    return offScaleMatch[1];
  }

  if (motionDurationMatch) {
    return motionDurationMatch[1];
  }

  if (motionEasingMatch) {
    return motionEasingMatch[1];
  }

  return null;
}

function getCssFindingType({ motionDurationMatch, motionEasingMatch, tokenMatch }) {
  if (motionDurationMatch) {
    return 'motion-duration';
  }

  if (motionEasingMatch) {
    return 'motion-easing';
  }

  if (tokenMatch) {
    return 'token-opportunity';
  }

  return 'off-scale';
}

module.exports = {
  collectCssFindings,
  findDeclarationProperty,
  getCssFindingType,
  getCssFindingValue,
  positionToOffset,
  readSourceOnce,
  resolveScssSyntax,
  runStylelintAudit,
};
