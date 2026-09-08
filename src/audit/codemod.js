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
const { isCssFile, isScssFile, walkFiles } = require('./scan/files');
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

function replaceLength(root, { baseFontSize = 16, properties = null, px, replacement }) {
  const patterns = properties && properties.length > 0
    ? properties.map((property) => property.toLowerCase())
    : PROPERTY_GROUP_PATTERNS.spacing;
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
      if (nodePx === null || !numbersEqual(nodePx, px)) {
        return false;
      }
      const to = length.number < 0 ? negateReplacement(replacement) : replacement;
      changes.push({
        column: (decl.source && decl.source.start ? decl.source.start.column : 1) + declarationValueOffset(decl) + node.sourceIndex,
        from: node.value,
        line: decl.source && decl.source.start ? decl.source.start.line : 1,
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

function parseStylesheet(filePath, source) {
  if (isScssFile(filePath)) {
    const syntaxPath = resolveScssSyntax();
    if (!syntaxPath) {
      return null;
    }
    return postcss.parse(source, { from: filePath, syntax: require(syntaxPath) });
  }
  return postcss.parse(source, { from: filePath });
}

/**
 * Apply one replacement across a directory. Dry run unless `write`; returns
 * the per-file changes and which files were skipped (unparseable, or SCSS
 * without postcss-scss).
 */
function runCodemod({ baseFontSize = 16, dir, ignorePatterns = [], properties = null, px, replacement, write = false }) {
  const rootDir = path.resolve(process.cwd(), dir);
  const files = walkFiles(rootDir, ignorePatterns).cssFiles.filter(isCssFile).sort();
  const results = [];
  const skipped = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    let root;
    try {
      root = parseStylesheet(filePath, source);
    } catch {
      skipped.push({ file: formatPath(filePath), reason: 'could not parse' });
      continue;
    }
    if (!root) {
      skipped.push({ file: formatPath(filePath), reason: 'install postcss-scss to rewrite SCSS' });
      continue;
    }
    const changes = replaceLength(root, { baseFontSize, properties, px, replacement });
    if (changes.length === 0) {
      continue;
    }
    if (write) {
      fs.writeFileSync(filePath, root.toString());
    }
    results.push({ changes, file: formatPath(filePath) });
  }
  return { results, skipped };
}

module.exports = {
  replaceLength,
  runCodemod,
};
