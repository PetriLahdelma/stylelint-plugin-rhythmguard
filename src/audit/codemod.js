'use strict';

const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const { PROPERTY_GROUP_PATTERNS } = require('../core/css-vocabulary');
const { numbersEqual, parseLengthToken, toPx } = require('../core/length');
const { negateReplacement } = require('../core/token-index');
const { isTokenFunction, propertyMatches, walkRootValueNodes } = require('../core/value-nodes');
const { formatPath } = require('./shared');
const { isCssFile, isPathInside, isScssFile, isTemplateFile, walkFiles } = require('./scan/files');
const { resolveScssSyntax } = require('./scan/stylesheets');

/**
 * The targeted codemod: one value, one replacement, reviewable as one change.
 * It walks declaration values the way the rules do, so `10px` inside `110px`,
 * inside `var(--x, 10px)`, on a non-spacing property or in a token definition
 * is never touched. Matching is by px, so `0.625rem` is the same value as
 * `10px`. The sign is kept: a negative literal becomes a negated replacement.
 */
const TOKEN_FUNCTIONS = ['var', 'theme', 'token'];
const ANY_TOKEN = /./;

/**
 * Several replacements (`rhythmguard fix --decided`) run in one pass over the
 * original values: each literal is matched against the list once, and a value
 * one replacement writes is never matched again, so decisions 10px -> 14px and
 * 14px -> 16px leave padding: 10px at 14px. The first matching entry wins.
 */
function normalizeReplacements({ px, replacement, replacements }) {
  return Array.isArray(replacements) ? replacements : [{ px, replacement }];
}

function replaceLength(root, { baseFontSize = 16, properties = null, px, replacement, replacements }) {
  const patterns = properties && properties.length > 0
    ? properties.map((property) => property.toLowerCase())
    : PROPERTY_GROUP_PATTERNS.spacing;
  const planned = normalizeReplacements({ px, replacement, replacements });
  const changes = [];

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (prop.startsWith('--') || prop.startsWith('$') || !propertyMatches(prop, patterns)) {
      return;
    }
    const parsed = valueParser(decl.value);
    let changed = false;
    walkRootValueNodes(parsed, (node) => {
      if (node.type === 'function') {
        // true skips the children: nothing inside var()/theme()/token() is ours to rewrite
        return isTokenFunction(node, TOKEN_FUNCTIONS, ANY_TOKEN);
      }
      if (node.type !== 'word') {
        return false;
      }
      const length = parseLengthToken(node.value);
      if (!length || length.number === 0 || length.unit === '%' || length.unit === '') {
        return false;
      }
      const nodePx = toPx(Math.abs(length.number), length.unit, baseFontSize);
      const match = nodePx === null ? null : planned.find((entry) => numbersEqual(nodePx, entry.px));
      if (!match) {
        return false;
      }
      const to = length.number < 0 ? negateReplacement(match.replacement) : match.replacement;
      const position = positionInDeclaration(decl, declarationValueOffset(decl) + node.sourceIndex);
      changes.push({
        column: position.column,
        from: node.value,
        line: position.line,
        property: decl.prop,
        to,
      });
      node.value = to;
      changed = true;
      return false;
    });
    if (changed) {
      decl.value = parsed.toString();
    }
  });

  return changes;
}

function declarationValueOffset(decl) {
  const raws = decl.raws || {};
  const between = typeof raws.between === 'string' ? raws.between : ': ';
  return decl.prop.length + between.length;
}

/**
 * The line and column of `index`, an offset into the declaration as written
 * (property, separator, value), counted from where the declaration starts. A
 * value that spans lines puts later literals on later lines (#288).
 */
function positionInDeclaration(decl, index) {
  const start = decl.source && decl.source.start ? decl.source.start : { column: 1, line: 1 };
  const raws = decl.raws || {};
  const text = `${decl.prop}${typeof raws.between === 'string' ? raws.between : ': '}${decl.value}`.slice(0, index);
  const lastBreak = text.lastIndexOf('\n');
  const breaks = text.split('\n').length - 1;
  return breaks === 0
    ? { column: start.column + index, line: start.line }
    : { column: index - lastBreak, line: start.line + breaks };
}

/**
 * Parse with the syntax that will write the file back. SCSS goes through
 * postcss-scss's own parse and stringify: `postcss.parse` ignores a `syntax`
 * option, so it would read `// a: 10px` as a declaration and rewrite it.
 * Returns null for SCSS when postcss-scss cannot be resolved; such a file is
 * skipped, never parsed as CSS.
 */
function parseStylesheet(filePath, source) {
  if (isScssFile(filePath)) {
    const syntaxPath = resolveScssSyntax();
    if (!syntaxPath) {
      return null;
    }
    const syntax = require(syntaxPath);
    return { root: syntax.parse(source, { from: filePath }), syntax };
  }
  return { root: postcss.parse(source, { from: filePath }), syntax: null };
}

/**
 * Apply one replacement (`px` and `replacement`), or several in one pass
 * (`replacements: [{ px, replacement }]`), across a directory. Dry run unless
 * `write`; the dry run reports exactly what a write would write. Returns
 * the per-file changes and which files were skipped (unparseable, or SCSS
 * without postcss-scss). `ignorePatterns` are root-relative paths and globs,
 * as the audit takes them; the audit's generated and vendored directories
 * (node_modules, dist, build and the rest of SKIP_DIRS) are always skipped.
 */
function runCodemod({ baseFontSize = 16, dir, ignorePatterns = [], properties = null, px, replacement, replacements, write = false }) {
  const rootDir = path.resolve(process.cwd(), dir);
  const walked = walkFiles(rootDir, ignorePatterns);
  const files = walked.cssFiles.filter(isCssFile).sort();
  const results = [];
  const skipped = walked.linksOutsideRoot
    .filter((link) => !isTemplateFile(link))
    .map((link) => ({ file: formatPath(path.join(rootDir, link)), reason: 'symbolic link to a path outside the directory; not followed' }));
  const realRoot = fs.realpathSync(rootDir);
  const rewritten = new Set();
  for (const filePath of files) {
    // Never write through a symbolic link: a file is rewritten only at its own
    // path inside the directory, and only once (#289).
    const realPath = writableRealPath(filePath, rootDir, realRoot);
    if (!realPath) {
      skipped.push({ file: formatPath(filePath), reason: 'reached through a symbolic link; rewrite the file it points to instead' });
      continue;
    }
    if (rewritten.has(realPath)) {
      continue;
    }
    rewritten.add(realPath);
    const source = fs.readFileSync(filePath, 'utf8');
    let parsed;
    try {
      parsed = parseStylesheet(filePath, source);
    } catch {
      skipped.push({ file: formatPath(filePath), reason: 'could not parse' });
      continue;
    }
    if (!parsed) {
      skipped.push({ file: formatPath(filePath), reason: 'postcss-scss is not installed; install it to rewrite SCSS' });
      continue;
    }
    const { root, syntax } = parsed;
    const changes = replaceLength(root, { baseFontSize, properties, px, replacement, replacements });
    if (changes.length === 0) {
      continue;
    }
    if (write) {
      fs.writeFileSync(filePath, syntax ? root.toString(syntax) : root.toString());
    }
    results.push({ changes, file: formatPath(filePath) });
  }
  return { results, skipped };
}

/**
 * The real path of `filePath` when it is the file's own path: no symbolic link
 * between `rootDir` and the file, and the file inside `rootDir`. Null otherwise.
 */
function writableRealPath(filePath, rootDir, realRoot) {
  let realPath;
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      return null;
    }
    realPath = fs.realpathSync(filePath);
  } catch {
    return null;
  }
  const expected = path.join(realRoot, path.relative(rootDir, filePath));
  return realPath === expected && isPathInside(realRoot, realPath) ? realPath : null;
}

module.exports = {
  replaceLength,
  runCodemod,
};
