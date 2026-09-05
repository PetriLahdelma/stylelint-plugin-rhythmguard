'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { formatLength } = require('../utils/length');
const { createTailwindClassAnalyzer } = require('../utils/tailwind-class-analysis');
const { createTailwindMotionAnalyzer } = require('../utils/tailwind-motion-analysis');
const { formatTime } = require('../utils/time');
const {
  DEFAULT_AUDIT_TOKEN_PATTERN,
  SKIP_DIRS,
  TEMPLATE_EXTENSIONS,
  formatPath,
  pluginPath,
} = require('./shared');

function assertDirectory(dir) {
  if (!dir) {
    throw new Error('Missing audit directory.');
  }

  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  return resolvedDir;
}

function walkFiles(rootDir, ignorePatterns = []) {
  const cssFiles = [];
  const templateFiles = [];
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosixRelativePath(rootDir, fullPath);

      if (shouldIgnorePath(relativePath, entry, ignoreMatchers)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (isCssFile(fullPath)) {
          cssFiles.push(fullPath);
        } else if (isTemplateFile(fullPath)) {
          templateFiles.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return { cssFiles, templateFiles };
}

function getScanFiles(rootDir, ignorePatterns, parsed) {
  if (parsed.staged || parsed.since) {
    return getGitChangedScanFiles(rootDir, ignorePatterns, parsed);
  }

  return {
    ...walkFiles(rootDir, ignorePatterns),
    scanScope: {
      mode: 'full',
    },
  };
}

function getGitChangedScanFiles(rootDir, ignorePatterns, parsed) {
  const args = parsed.staged
    ? ['diff', '--name-only', '--cached', '--diff-filter=ACMR', '--']
    : ['diff', '--name-only', '--diff-filter=ACMR', parsed.since, '--'];
  let output = '';

  try {
    output = execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`Unable to read changed files from git: ${stderr}`);
  }

  const cssFiles = [];
  const templateFiles = [];
  const ignoreMatchers = createIgnoreMatchers(ignorePatterns);
  const seen = new Set();
  const changedFiles = output.split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);

  for (const filePath of changedFiles) {
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!isPathInside(rootDir, fullPath) || seen.has(fullPath) || !fs.existsSync(fullPath)) {
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      continue;
    }

    const relativePath = toPosixRelativePath(rootDir, fullPath);
    if (shouldIgnoreRelativeFile(relativePath, ignoreMatchers)) {
      continue;
    }

    seen.add(fullPath);
    if (isCssFile(fullPath)) {
      cssFiles.push(fullPath);
    } else if (isTemplateFile(fullPath)) {
      templateFiles.push(fullPath);
    }
  }

  return {
    cssFiles,
    scanScope: {
      changedFiles: changedFiles.length,
      mode: parsed.staged ? 'staged' : 'since',
      since: parsed.since,
    },
    templateFiles,
  };
}

function isPathInside(rootDir, filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function shouldIgnorePath(relativePath, entry, ignoreMatchers) {
  return ignoreMatchers.some((matcher) => matcher.test(relativePath))
    || (entry.isDirectory() && SKIP_DIRS.has(entry.name));
}

function shouldIgnoreRelativeFile(relativePath, ignoreMatchers) {
  const segments = relativePath.split('/');
  return segments.some((segment) => SKIP_DIRS.has(segment))
    || ignoreMatchers.some((matcher) => matcher.test(relativePath));
}

function createIgnoreMatchers(patterns) {
  const variants = new Set();

  for (const pattern of patterns) {
    addIgnorePatternVariants(variants, pattern);
  }

  return Array.from(variants, (pattern) => globToRegExp(pattern));
}

function addIgnorePatternVariants(variants, pattern) {
  if (!pattern) {
    return;
  }

  variants.add(pattern);

  if (!pattern.includes('/')) {
    variants.add(`${pattern}/**`);
    variants.add(`**/${pattern}`);
    variants.add(`**/${pattern}/**`);
    return;
  }

  if (pattern.endsWith('/**')) {
    variants.add(pattern.slice(0, -3));
    return;
  }

  if (!hasGlob(pattern)) {
    variants.add(`${pattern}/**`);
  }
}

function hasGlob(pattern) {
  return /[*?]/.test(pattern);
}

function globToRegExp(pattern) {
  let source = '^';

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];

    if (char === '*' && nextChar === '*') {
      source += '.*';
      index++;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function toPosixRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function isScssFile(filePath) {
  return filePath.endsWith('.scss');
}

// "CSS files" in the audit means authored stylesheets: .css always, .scss when
// postcss-scss can be resolved (see resolveScssSyntax).
function isCssFile(filePath) {
  return filePath.endsWith('.css') || isScssFile(filePath);
}

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

function isTemplateFile(filePath) {
  return TEMPLATE_EXTENSIONS.has(path.extname(filePath));
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

  for (const fileResult of fileResults) {
    for (const warning of fileResult.warnings || []) {
      const text = warning.text || '';
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

function collectTailwindFindings(templateFiles, options) {
  const analyzer = createTailwindClassAnalyzer(options);
  const findings = [];

  for (const filePath of templateFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = getLineStarts(source);

    for (const literal of findStringLiterals(source)) {
      for (const { analysis, segment } of analyzer.analyzeClassString(literal.value)) {
        const position = offsetToLineColumn(lineStarts, literal.valueStart + segment.start);
        findings.push({
          column: position.column,
          file: formatPath(filePath),
          fixedToken: analysis.fixedToken,
          line: position.line,
          nearest: analysis.nearest
            ? {
              lower: formatLength(analysis.nearest.lower, 'px'),
              upper: formatLength(analysis.nearest.upper, 'px'),
            }
            : null,
          rawValue: analysis.rawValue,
          rule: 'rhythmguard-tailwind/tailwind-class-use-scale',
          text: analysis.reason === 'negative'
            ? `Unexpected Tailwind arbitrary spacing value "${segment.token}". Negative values are disabled for this rule.`
            : `Unexpected Tailwind arbitrary spacing value "${segment.token}". Use scale values.`,
          token: segment.token,
          type: 'tailwind-arbitrary-spacing',
          utility: analysis.utility,
        });
      }
    }
  }

  return findings;
}

function collectTailwindMotionFindings(templateFiles, options) {
  if (!options.includeMotion) {
    return [];
  }

  const analyzer = createTailwindMotionAnalyzer(options);
  const findings = [];

  for (const filePath of templateFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineStarts = getLineStarts(source);

    for (const literal of findStringLiterals(source)) {
      for (const { analysis, segment } of analyzer.analyzeClassString(literal.value)) {
        const position = offsetToLineColumn(lineStarts, literal.valueStart + segment.start);
        findings.push({
          column: position.column,
          file: formatPath(filePath),
          fixedToken: analysis.fixedToken,
          line: position.line,
          nearest: analysis.nearest
            ? {
              lower: formatTime(analysis.nearest.lower, 'ms'),
              upper: formatTime(analysis.nearest.upper, 'ms'),
            }
            : null,
          rawValue: analysis.rawValue,
          rule: 'rhythmguard-tailwind/tailwind-class-use-motion-scale',
          text: buildTailwindMotionFindingText(segment.token, analysis),
          token: segment.token,
          type: analysis.reason === 'easing'
            ? 'tailwind-motion-easing'
            : 'tailwind-motion-duration',
          utility: analysis.utility,
        });
      }
    }
  }

  return findings;
}

function buildTailwindMotionFindingText(token, analysis) {
  if (analysis.reason === 'easing') {
    return `Unexpected Tailwind arbitrary motion easing "${token}". Use motion tokens for easing decisions.`;
  }

  if (analysis.reason === 'negative') {
    return `Unexpected Tailwind arbitrary motion duration "${token}". Use non-negative duration values.`;
  }

  return `Unexpected Tailwind arbitrary motion duration "${token}". Use duration scale values.`;
}

function findStringLiterals(source) {
  const literals = [];
  const literalPattern = /(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
  let match;

  while ((match = literalPattern.exec(source)) !== null) {
    literals.push({
      quote: match[1],
      value: match[2],
      valueStart: match.index + 1,
    });
  }

  return literals;
}

function getLineStarts(source) {
  const starts = [0];

  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function offsetToLineColumn(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    column: offset - lineStarts[lineIndex] + 1,
    line: lineIndex + 1,
  };
}

module.exports = {
  addIgnorePatternVariants,
  assertDirectory,
  buildTailwindMotionFindingText,
  collectCssFindings,
  collectTailwindFindings,
  collectTailwindMotionFindings,
  createIgnoreMatchers,
  escapeRegExp,
  findStringLiterals,
  getCssFindingType,
  getCssFindingValue,
  getGitChangedScanFiles,
  getLineStarts,
  getScanFiles,
  globToRegExp,
  hasGlob,
  isCssFile,
  isScssFile,
  resolveScssSyntax,
  isPathInside,
  isTemplateFile,
  offsetToLineColumn,
  runStylelintAudit,
  shouldIgnorePath,
  shouldIgnoreRelativeFile,
  toPosixRelativePath,
  walkFiles,
};
