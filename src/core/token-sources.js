'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { stripBom } = require('./json');
const {
  formatLength,
  parseLengthToken,
  toPx,
} = require('./length');

const VALID_TOKEN_SOURCE_FORMATS = new Set([
  'auto',
  'css',
  'flat-json',
  'style-dictionary',
  'dtcg',
]);

const VALID_TOKEN_KINDS = new Set([
  'spacing',
  'radius',
  'typography',
  'size',
  'motion',
  'all',
]);

const TOKEN_KIND_PATTERNS = Object.freeze({
  all: /^--/,
  radius: /^--radius-/,
  motion: /^--(?:motion|duration|delay|ease|easing)-/,
  size: /^--(?:size|width|height|container)-/,
  // Anchored or prefixed (--spacing-4, --lb-spacing-md, bare Tailwind v4 --spacing), never letter-/word-spacing.
  // CSS custom properties (--spacing-4, --lb-spacing-md, bare --spacing) and Sass
  // variables or map entries ($spacer, $spacers.3, $system-spacing.small.2).
  // Custom properties may carry a namespace (--lb-spacing-md, --mantine-spacing-xs, bare
  // --spacing) but never letter-/word-spacing. Sass names must start with the scale word
  // (an optional `system-` prefix allowed): $spacer, $spacers.3, $spacing-01, $system-spacing.
  // Component variables such as $dropdown-spacer or $card-spacer-y are not scale tokens.
  spacing: /^(?:\$(?:system-)?(?:space|spacing|spacer)s?(?:-|$|\.)|--(?:[\w-]*-)?(?<!letter-)(?<!word-)(?:space|spacing|spacer)(?:-|$))/,
  // Tailwind's --text-* and the --fs-* shorthand are font sizes, and tracking
  // tokens (--letter-spacing-*, --tw-word-spacing) are type, never spacing (issue #239).
  typography: /^--(?:(?:font|font-size|line-height|leading|tracking|typography|text|fs)-|(?:[\w-]*-)?(?:letter|word)-spacing(?:-|$))/,
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeTokenSourceFormat(format) {
  const normalized = String(format || 'auto').trim().toLowerCase();
  if (!VALID_TOKEN_SOURCE_FORMATS.has(normalized)) {
    throw new Error(`Invalid token source format "${format}". Expected auto, css, flat-json, style-dictionary, or dtcg.`);
  }

  return normalized;
}

function normalizeTokenKind(kind) {
  const normalized = String(kind || 'spacing').trim().toLowerCase();
  if (!VALID_TOKEN_KINDS.has(normalized)) {
    throw new Error(`Invalid token kind "${kind}". Expected spacing, radius, typography, size, motion, or all.`);
  }

  return normalized;
}

function createPatternMatcher(pattern, fallback) {
  try {
    const regex = new RegExp(pattern);
    return (token) => regex.test(token);
  } catch {
    return fallback;
  }
}

function createTokenKindMatcher(kind) {
  const normalizedKind = normalizeTokenKind(kind);
  const pattern = TOKEN_KIND_PATTERNS[normalizedKind] || TOKEN_KIND_PATTERNS.spacing;

  return (token) => pattern.test(token);
}

/**
 * Why a source that parsed gave nothing: what was looked for, and for spacing
 * the naming rule a design-tool export most often misses (issue #163).
 */
function emptySourceWarning(source, format, tokenKind) {
  const prefix = `Token source ${source.displayPath} (${format}) yielded no`;
  if (source.tokenPattern) {
    return `${prefix} tokens matching tokenPattern "${source.tokenPattern}".`;
  }
  if (tokenKind === 'all') {
    return `${prefix} tokens.`;
  }
  if (tokenKind === 'spacing') {
    return `${prefix} spacing tokens; spacing tokens are read by name (space, spacing or spacer), so set a tokenPattern on this source if its tokens are named otherwise.`;
  }
  return `${prefix} ${tokenKind} tokens.`;
}

/**
 * Read token sources into definitions, with one report per source. With
 * `warnWhenEmpty`, a source that parses but yields no token of the kind read
 * gets a warning too; the audit and `rhythmguard doctor` ask for that for the
 * token sources a project configures.
 */
function parseTokenSources({
  baseFontSize = 16,
  sources = [],
  tokenKind = 'spacing',
  warnWhenEmpty = false,
} = {}) {
  const definitions = new Map();
  const sourceReports = [];
  const warnings = [];
  const matchesKind = createTokenKindMatcher(tokenKind);
  const kind = normalizeTokenKind(tokenKind);

  for (const source of sources) {
    const normalizedSource = normalizeTokenSource(source);
    const sourceReport = {
      file: formatPath(normalizedSource.resolvedPath),
      format: normalizedSource.format,
      requestedFormat: normalizedSource.requestedFormat,
      tokenCount: 0,
      warnings: [],
    };

    if (!fs.existsSync(normalizedSource.resolvedPath)) {
      const warning = `Token source not found: ${normalizedSource.displayPath}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    let text;
    try {
      text = stripBom(fs.readFileSync(normalizedSource.resolvedPath, 'utf8'));
    } catch (err) {
      const warning = `Unable to read token source ${normalizedSource.displayPath}: ${err.message}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    let tokens;
    const matchesSource = normalizedSource.tokenPattern
      ? createPatternMatcher(normalizedSource.tokenPattern, matchesKind)
      : matchesKind;
    const skipped = [];
    try {
      if (normalizedSource.format === 'css') {
        tokens = collectCssTokens(text, matchesSource, { lineComments: hasLineComments(normalizedSource.resolvedPath) });
      } else {
        const parsed = JSON.parse(text);
        const detectedFormat = normalizedSource.requestedFormat === 'auto'
          ? detectJsonTokenFormat(parsed)
          : normalizedSource.format;
        sourceReport.format = detectedFormat;
        tokens = collectJsonTokens(parsed, matchesSource, (token, reason) => skipped.push(`${token} (${reason})`));
      }
    } catch (err) {
      const warning = `Unable to parse token source ${normalizedSource.displayPath}: ${err.message}`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
      sourceReports.push(sourceReport);
      continue;
    }

    if (skipped.length > 0) {
      const warning = `Token source ${normalizedSource.displayPath}: skipped ${skipped.join(', ')}.`;
      sourceReport.warnings.push(warning);
      warnings.push(warning);
    }

    if (warnWhenEmpty && tokens.length === 0) {
      const warning = emptySourceWarning(normalizedSource, sourceReport.format, kind);
      sourceReport.warnings.push(warning);
      warnings.push(warning);
    }

    for (const token of tokens) {
      addDefinition(definitions, {
        baseFontSize,
        file: sourceReport.file,
        // `:root` and `@theme` declarations are the scale; a `.chip` variable is a
        // component parameter and stays out of it, as in the linted stylesheet (issue #258).
        scope: token.scope || 'root',
        source: sourceReport.file,
        token: token.token,
        value: token.value,
      });
    }

    sourceReport.tokenCount = tokens.length;
    sourceReports.push(sourceReport);
  }

  return {
    definitions,
    sources: sourceReports,
    warnings,
  };
}

function normalizeTokenSource(source) {
  if (!isPlainObject(source)) {
    throw new Error('Token source entries must be strings or objects with a path.');
  }

  const sourcePath = source.path || source.file;
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw new Error('Token source entries must include a non-empty path.');
  }

  const baseDir = source.baseDir || process.cwd();
  const requestedFormat = normalizeTokenSourceFormat(source.format || 'auto');
  const resolvedPath = path.resolve(baseDir, sourcePath);

  return {
    displayPath: sourcePath,
    format: requestedFormat === 'auto' ? detectSourceFormat(resolvedPath) : requestedFormat,
    requestedFormat,
    resolvedPath,
    // Optional per-source override for packages that name spacing tokens differently
    // (Primer's --base-size-*). Falls back to the kind matcher when absent.
    tokenPattern: typeof source.tokenPattern === 'string' && source.tokenPattern ? source.tokenPattern : null,
  };
}

function detectSourceFormat(filePath) {
  // .scss token files are read by the CSS collector too: custom properties plus Sass variables and maps.
  if (['.css', '.scss'].includes(path.extname(filePath).toLowerCase())) {
    return 'css';
  }

  return 'flat-json';
}

function detectJsonTokenFormat(parsed) {
  let hasDtcg = false;
  let hasStyleDictionary = false;

  function walk(value) {
    if (!isPlainObject(value)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(value, '$value')) {
      hasDtcg = true;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      hasStyleDictionary = true;
    }

    for (const child of Object.values(value)) {
      walk(child);
    }
  }

  walk(parsed);

  if (hasDtcg) {
    return 'dtcg';
  }

  if (hasStyleDictionary) {
    return 'style-dictionary';
  }

  return 'flat-json';
}

/**
 * Custom properties and Sass tokens in a stylesheet. `lineComments` says
 * whether `//` starts a comment: true for SCSS and Less, false for a plain
 * `.css` file (see hasLineComments).
 */
function collectCssTokens(source, matchesKind, { lineComments = true } = {}) {
  const tokens = [];
  for (const declaration of customPropertyDeclarations(source, { lineComments })) {
    if (matchesKind(declaration.token)) {
      tokens.push(declaration);
    }
  }
  for (const sassToken of collectScssTokens(source, matchesKind, { lineComments })) {
    tokens.push({ ...sassToken, scope: 'root' });
  }
  return tokens;
}

/** Plain CSS has no `//` comments; SCSS, Less and the other preprocessor syntaxes do. */
function hasLineComments(filePath) {
  return path.extname(String(filePath || '')).toLowerCase() !== '.css';
}

const ROOT_SELECTOR = /^(?::root|html|:host|:(?:where|is)\(\s*(?::root|html)\s*\))$/i;
// At-rules that only condition their contents; the enclosing selector still decides the scope.
const TRANSPARENT_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document']);

/**
 * Whether `//` at `index` starts a line comment. Never in plain CSS, and never
 * right after `:` or `(`, so `https://` and an unquoted `url(//cdn...)` stay
 * values (issue #263).
 */
function startsLineComment(source, index, lineComments) {
  return lineComments
    && source[index] === '/'
    && source[index + 1] === '/'
    && !/[:(]/.test(source[index - 1] || '');
}

/** The index just past the string that opens at `index`, honouring backslash escapes. */
function skipString(source, index) {
  const quote = source[index];
  let end = index + 1;
  while (end < source.length && source[end] !== quote) end += source[end] === '\\' ? 2 : 1;
  return Math.min(end + 1, source.length);
}

/**
 * The text with comments removed and strings kept as written. A block comment
 * becomes a space so the tokens on either side stay apart; a line comment is
 * dropped up to its newline.
 */
function stripComments(text, { lineComments = true } = {}) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      const end = skipString(text, index);
      output += text.slice(index, end);
      index = end;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      output += ' ';
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    if (startsLineComment(text, index, lineComments)) {
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

/**
 * The value of a custom property declaration whose value starts at `start`:
 * the text up to the `;` that ends it (outside strings and parentheses) or up
 * to the brace that closes its block. Comments are dropped and a trailing
 * `!important` is removed, so `4px !important` and `4px` followed by a
 * comment are both `4px` (issue #269). Returns the value and where it ends.
 */
function readCustomPropertyValue(source, start, lineComments) {
  let value = '';
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      const end = skipString(source, index);
      value += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      value += ' ';
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (startsLineComment(source, index, lineComments)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === '{' || char === '}' || (char === ';' && depth === 0)) {
      break;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    value += char;
    index += 1;
  }
  return { end: index, value: value.replace(/\s*!\s*important\s*$/i, '').trim() };
}

function scopeOfBlockHeaders(headers) {
  for (let index = headers.length - 1; index >= 0; index -= 1) {
    const header = headers[index];
    if (header.startsWith('@')) {
      const name = header.slice(1).match(/^[\w-]+/);
      if (name && name[0].toLowerCase() === 'theme') return 'root';
      if (name && TRANSPARENT_AT_RULES.has(name[0].toLowerCase())) continue;
      return 'component';
    }
    return header.split(',').every((selector) => ROOT_SELECTOR.test(selector.trim())) ? 'root' : 'component';
  }
  return 'root';
}

/**
 * Custom property declarations with the scope they are declared in: `root`
 * for `:root`, `html`, `:host` and `@theme` blocks (through conditional
 * at-rules), `component` for anything else. One pass over the source that
 * skips comments and strings, so a brace in a comment cannot shift the
 * scope; this is the text-side twin of scopeOfNode in scale-inference.js.
 */
function customPropertyDeclarations(source, { lineComments = true } = {}) {
  const declarations = [];
  const headers = [];
  let headerStart = 0;
  let index = 0;
  const length = source.length;

  while (index < length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? length : end + 2;
      continue;
    }
    if (startsLineComment(source, index, lineComments)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? length : end;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(source, index);
      continue;
    }
    if (char === '{') {
      if (source[index - 1] === '#') {
        const end = source.indexOf('}', index);
        index = end === -1 ? length : end + 1;
        continue;
      }
      headers.push(stripComments(source.slice(headerStart, index), { lineComments }).trim().replace(/\s+/g, ' '));
      headerStart = index + 1;
      index += 1;
      continue;
    }
    if (char === '}') {
      headers.pop();
      headerStart = index + 1;
      index += 1;
      continue;
    }
    if (char === ';') {
      headerStart = index + 1;
      index += 1;
      continue;
    }
    if (char === '-' && next === '-' && !/[\w-]/.test(source[index - 1] || '')) {
      const match = /^(--[\w-]+)\s*:/.exec(source.slice(index, index + 256));
      if (match) {
        const { end, value } = readCustomPropertyValue(source, index + match[0].length, lineComments);
        if (value) {
          declarations.push({ scope: scopeOfBlockHeaders(headers), token: match[1], value });
        }
        index = end;
        continue;
      }
    }
    index += 1;
  }

  return declarations;
}

/**
 * Sass variables and maps as token sources. Handles `$spacer: 1rem`, maps such
 * as `$spacers: (1: $spacer * .25, ...)` including nested maps, variable
 * references, `* / + -` arithmetic and `math.div()`. Anything it cannot
 * evaluate (function calls, strings, keywords, interpolated keys, cycles) is
 * skipped rather than guessed. Token names are `$name` or `$name.key.path`.
 */
function collectScssTokens(source, matchesKind, { lineComments = true } = {}) {
  // Only top-level and `!global` declarations define the project's variables;
  // `$spacer: 2px` inside `.compact` is local to that block (issue #266).
  const declarations = parseScssDeclarations(source, { lineComments, topLevelOnly: true });
  const cache = new Map();

  const resolveVariable = (name, stack) => {
    if (cache.has(name)) {
      return cache.get(name);
    }
    if (stack.has(name) || !declarations.has(name)) {
      return null;
    }
    stack.add(name);
    const raw = declarations.get(name);
    const value = isScssMap(raw) ? null : evaluateScssExpression(raw, resolveVariable, stack);
    stack.delete(name);
    cache.set(name, value);
    return value;
  };

  const tokens = [];
  const push = (tokenName, value, force = false) => {
    if (!value || (!force && !matchesKind(tokenName))) {
      return;
    }
    const formatted = formatScssValue(value);
    // A unitless number is a multiplier or a map index, not a length. Zero is fine.
    if (/^-?\d*\.?\d+$/.test(formatted) && parseFloat(formatted) !== 0) {
      return;
    }
    tokens.push({ token: tokenName, value: formatted });
  };
  // Namespaced maps such as GOV.UK's $govuk-spacing-points are only accepted
  // for the spacing kind, and only when they hold a real ladder (issue #86).
  const spacingKind = matchesKind('$spacing-probe');

  for (const [name, raw] of declarations) {
    const tokenName = `$${name}`;
    if (isScssMap(raw)) {
      if (!matchesKind(tokenName) && spacingKind && NAMESPACED_SPACING_MAP.test(tokenName)) {
        const entries = [];
        walkScssMap(raw, [tokenName], (pathName, expression) => {
          const value = evaluateScssExpression(expression, resolveVariable, new Set());
          if (value) {
            entries.push([pathName, value]);
          }
        });
        const distinct = new Set(entries.map(([, value]) => formatScssValue(value)).filter((value) => /^-?\d*\.?\d+(?:px|rem|em)$/.test(value) && parseFloat(value) !== 0));
        if (distinct.size >= MIN_NAMESPACED_MAP_LENGTHS) {
          for (const [pathName, value] of entries) {
            push(pathName, value, true);
          }
        }
        continue;
      }
      walkScssMap(raw, [tokenName], (pathName, expression) => {
        push(pathName, evaluateScssExpression(expression, resolveVariable, new Set()));
      });
      continue;
    }
    push(tokenName, resolveVariable(name, new Set()));
  }

  return tokens;
}

/**
 * A variable resolver over a Sass source text, for evaluating declaration
 * values: same-file declarations first, then `fallback(name)` for a length
 * declared elsewhere (a scaleSources file, an installed package).
 */
function createScssVariableResolver(source, fallback = () => null) {
  const declarations = parseScssDeclarations(source || '');
  const cache = new Map();
  const resolveVariable = (name, stack) => {
    if (cache.has(name)) {
      return cache.get(name);
    }
    if (stack.has(name)) {
      return null;
    }
    let value;
    if (declarations.has(name)) {
      stack.add(name);
      const raw = declarations.get(name);
      value = isScssMap(raw) ? null : evaluateScssExpression(raw, resolveVariable, stack);
      stack.delete(name);
    } else {
      value = fallback(name);
    }
    cache.set(name, value);
    return value;
  };
  return resolveVariable;
}

/** `$<namespace>-spacing-points`, `$<ns>-space-scale`: one namespace segment before the anchor. */
const NAMESPACED_SPACING_MAP = /^\$[a-z0-9]+-(?:space|spacing|spacer)s?(?:-|$)/i;
const MIN_NAMESPACED_MAP_LENGTHS = 4;

/**
 * The value of a Sass variable declaration starting at `start`: the text up to
 * the `;` outside parentheses and strings. With `stopAtBrace`, a `}` outside
 * parentheses also ends it (a last declaration without `;` in a block), and an
 * interpolation `#{...}` is kept whole.
 */
function readScssValue(text, start, stopAtBrace) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = skipString(text, index);
      continue;
    }
    if (stopAtBrace && char === '#' && text[index + 1] === '{') {
      const end = text.indexOf('}', index + 2);
      index = end === -1 ? text.length : end + 1;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ';' && depth <= 0) break;
    else if (stopAtBrace && depth <= 0 && (char === '}' || char === '{')) break;
    index += 1;
  }
  return { end: index, value: text.slice(start, index) };
}

/**
 * The start of every top-level Sass variable declaration, plus those inside a
 * block that carry `!global`. Declarations in style rules, mixins, functions,
 * `@media` and control-flow blocks are local or conditional, and `$name:`
 * inside parentheses is a parameter or a `@use ... with (...)` setting, so
 * none of those count. Several declarations may share a line.
 */
function topLevelScssDeclarations(text) {
  const found = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let statementStart = true;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = skipString(text, index);
      statementStart = false;
      continue;
    }
    if (char === '#' && text[index + 1] === '{') {
      const end = text.indexOf('}', index + 2);
      index = end === -1 ? text.length : end + 1;
      statementStart = false;
      continue;
    }
    if (char === '{' || char === '}') {
      braceDepth = Math.max(0, braceDepth + (char === '{' ? 1 : -1));
      parenDepth = 0;
      statementStart = true;
      index += 1;
      continue;
    }
    if (char === ';') {
      statementStart = parenDepth === 0;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '$' && statementStart && parenDepth === 0) {
      const match = /^\$([\w-]+)\s*:/.exec(text.slice(index, index + 256));
      if (match) {
        const { end, value } = readScssValue(text, index + match[0].length, true);
        if (braceDepth === 0 || /!global\b/.test(value)) {
          found.push({ name: match[1], value });
        }
        index = end;
        statementStart = false;
        continue;
      }
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    statementStart = false;
    index += 1;
  }
  return found;
}

/**
 * Every Sass variable declaration that starts a line, wherever it is. The
 * resolver for a linted stylesheet's own values reads these; token collection
 * reads topLevelScssDeclarations instead.
 */
function lineStartScssDeclarations(text) {
  const found = [];
  const startPattern = /(?:^|\n)[ \t]*\$([\w-]+)[ \t]*:/g;
  let match;
  while ((match = startPattern.exec(text)) !== null) {
    const { end, value } = readScssValue(text, match.index + match[0].length, false);
    found.push({ name: match[1], value });
    startPattern.lastIndex = end;
  }
  return found;
}

function parseScssDeclarations(source, { lineComments = true, topLevelOnly = false } = {}) {
  const text = stripComments(source, { lineComments });
  const declarations = new Map();

  for (const { name, value } of topLevelOnly ? topLevelScssDeclarations(text) : lineStartScssDeclarations(text)) {
    const isDefault = /!default\b/.test(value);
    const cleaned = value.replace(/!(default|global)\b/g, '').trim();
    // Sass semantics at the top level: `!default` assigns only when the variable is
    // still unset, a plain assignment always wins. Bootstrap v6 declares
    // `$spacers: () !default;` and then `$spacers: defaults((...), $spacers);`.
    if (cleaned && (!declarations.has(name) || !isDefault)) {
      declarations.set(name, cleaned);
    }
  }

  for (const [name, raw] of declarations) {
    const unwrapped = unwrapScssMapCall(raw, declarations);
    if (unwrapped) {
      declarations.set(name, unwrapped);
    }
  }

  return declarations;
}

/**
 * A map declared through a merge helper, read as the map it produces:
 * `defaults((...), $spacers)` (Bootstrap v6), `map.merge($a, (...))`,
 * `map-merge((...), (...))`. Map-literal arguments and variables that hold a
 * map are merged left to right with later keys winning, as Sass does; anything
 * else (an unset `!default` placeholder, an expression) contributes nothing.
 */
const SCSS_MAP_MERGE_CALL = /^(?:defaults|map\.merge|map-merge)\s*\(([\s\S]*)\)$/;

function unwrapScssMapCall(raw, declarations) {
  const match = raw.match(SCSS_MAP_MERGE_CALL);
  if (!match) {
    return null;
  }
  const entries = new Map();
  for (const argument of splitTopLevel(match[1], ',')) {
    const text = argument.trim();
    let mapLiteral = null;
    if (isScssMap(text)) {
      mapLiteral = text;
    } else if (/^\$[\w-]+$/.test(text)) {
      const referenced = declarations.get(text.slice(1));
      if (referenced && isScssMap(referenced)) {
        mapLiteral = referenced;
      }
    }
    if (!mapLiteral) {
      continue;
    }
    for (const entry of splitTopLevel(mapLiteral.slice(1, -1), ',')) {
      const pair = splitTopLevel(entry, ':');
      if (pair.length < 2) continue;
      entries.set(pair[0].trim(), pair.slice(1).join(':').trim());
    }
  }
  if (entries.size === 0) {
    return null;
  }
  return `(${[...entries].map(([key, expression]) => `${key}: ${expression}`).join(', ')})`;
}

function isScssMap(raw) {
  return raw.startsWith('(') && raw.endsWith(')') && /:/.test(raw);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

// Real token maps nest two or three levels; generated or adversarial input can
// nest without bound. Past these limits the value is treated like any other
// expression the evaluator cannot handle: skipped, never guessed, never thrown.
const MAX_SCSS_MAP_DEPTH = 16;
const MAX_SCSS_EXPRESSION_DEPTH = 64;

function walkScssMap(raw, pathSegments, visit) {
  if (pathSegments.length > MAX_SCSS_MAP_DEPTH) {
    return;
  }
  const inner = raw.slice(1, -1);
  for (const entry of splitTopLevel(inner, ',')) {
    const pair = splitTopLevel(entry, ':');
    if (pair.length < 2) continue;
    const key = pair[0].trim().replace(/^["']|["']$/g, '');
    const expression = pair.slice(1).join(':').trim();
    if (!key || key.includes('#{')) continue;
    const nextPath = [...pathSegments, key];
    if (isScssMap(expression)) {
      walkScssMap(expression, nextPath, visit);
    } else {
      visit(nextPath.join('.'), expression);
    }
  }
}

const SCSS_TOKEN_PATTERN = /\s*(?:(-?(?:\d+\.?\d*|\.\d+)[a-zA-Z%]*)|(\$[\w-]+)|([a-zA-Z_][\w.-]*)\s*\(|([()*/+,-]))/y;

function tokenizeScssExpression(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    SCSS_TOKEN_PATTERN.lastIndex = index;
    const match = SCSS_TOKEN_PATTERN.exec(expression);
    if (!match) {
      if (/\s/.test(expression[index])) {
        index += 1;
        continue;
      }
      return null;
    }
    const start = index + (match[0].length - match[0].trimStart().length);
    index = SCSS_TOKEN_PATTERN.lastIndex;
    const span = { end: index, start };
    if (match[1] !== undefined) tokens.push({ type: 'number', raw: match[1], ...span });
    else if (match[2] !== undefined) tokens.push({ type: 'var', name: match[2].slice(1), ...span });
    else if (match[3] !== undefined) tokens.push({ type: 'call', name: match[3], ...span });
    else tokens.push({ type: 'op', value: match[4], ...span });
  }
  return tokens;
}

/** A recursive-descent parser over Sass expression tokens; `parseExpression` consumes one arithmetic expression. */
function createScssParser(tokens, resolveVariable, stack) {
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];

  const parseNumber = (raw) => {
    const parsed = parseLengthToken(raw);
    if (parsed) return { number: parsed.number, unit: parsed.unit };
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? { number: numeric, unit: '' } : null;
  };

  const combine = (left, op, right) => {
    if (!left || !right) return null;
    if (op === '*') {
      if (left.unit && right.unit) return null;
      return { number: left.number * right.number, unit: left.unit || right.unit };
    }
    if (op === '/') {
      if (right.number === 0) return null;
      if (right.unit && right.unit !== left.unit) return null;
      return { number: left.number / right.number, unit: right.unit ? '' : left.unit };
    }
    const compatible = left.unit === right.unit || left.number === 0 || right.number === 0;
    if (!compatible) return null;
    return { number: op === '+' ? left.number + right.number : left.number - right.number, unit: left.unit || right.unit };
  };

  let depth = 0;
  const parsePrimary = () => {
    if (depth > MAX_SCSS_EXPRESSION_DEPTH) return null;
    depth += 1;
    try {
      return parsePrimaryInner();
    } finally {
      depth -= 1;
    }
  };

  const parsePrimaryInner = () => {
    const token = next();
    if (!token) return null;
    if (token.type === 'number') return parseNumber(token.raw);
    if (token.type === 'var') return resolveVariable(token.name, stack);
    if (token.type === 'op' && token.value === '-') {
      const value = parsePrimary();
      return value ? { number: -value.number, unit: value.unit } : null;
    }
    if (token.type === 'op' && token.value === '(') {
      const value = parseExpression();
      const closing = next();
      return closing && closing.type === 'op' && closing.value === ')' ? value : null;
    }
    if (token.type === 'call') {
      const args = [];
      let current = parseExpression();
      args.push(current);
      while (peek() && peek().type === 'op' && peek().value === ',') {
        next();
        args.push(parseExpression());
      }
      const closing = next();
      if (!closing || closing.type !== 'op' || closing.value !== ')') return null;
      if (token.name === 'math.div' && args.length === 2) return combine(args[0], '/', args[1]);
      return null;
    }
    return null;
  };

  const parseTerm = () => {
    let value = parsePrimary();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      value = combine(value, op, parsePrimary());
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      value = combine(value, op, parseTerm());
    }
    return value;
  };

  return {
    get position() { return position; },
    parseExpression,
  };
}

function evaluateScssExpression(expression, resolveVariable, stack) {
  const tokens = tokenizeScssExpression(expression.trim());
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const parser = createScssParser(tokens, resolveVariable, stack);
  const result = parser.parseExpression();
  return parser.position === tokens.length ? result : null;
}

/**
 * A space-separated Sass value (`$spacer * .3 $spacer`) as its evaluated terms,
 * each with the source text it came from, or null when any term cannot be
 * evaluated (an unknown variable, a keyword, a function the evaluator does not
 * know). A `-` between terms is read as subtraction, as Sass does.
 */
function evaluateScssValueList(value, resolveVariable, stack) {
  const tokens = tokenizeScssExpression(value);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const parser = createScssParser(tokens, resolveVariable, stack);
  const terms = [];
  while (parser.position < tokens.length) {
    const startToken = tokens[parser.position];
    const before = parser.position;
    const result = parser.parseExpression();
    if (!result || parser.position === before) {
      return null;
    }
    const endToken = tokens[parser.position - 1];
    terms.push({ ...result, end: endToken.end, start: startToken.start, text: value.slice(startToken.start, endToken.end) });
  }
  return terms;
}

function formatScssValue(value) {
  const rounded = Math.round(value.number * 1000) / 1000;
  if (rounded === 0) return '0';
  return `${rounded}${value.unit}`;
}

/**
 * Tokens in a DTCG, Style Dictionary or flat JSON file. References
 * (`{dimension.100}`, `{size.base.value}`) are resolved against the whole file
 * first, so a semantic alias over a primitive of another kind still counts
 * (issue #267). `onSkip(token, reason)` hears about tokens of the requested
 * kind that were left out, such as a dimension in an unsupported unit.
 */
function collectJsonTokens(parsed, matchesKind, onSkip = () => {}) {
  if (!isPlainObject(parsed)) {
    return [];
  }

  const tokens = [];
  const context = { matchesKind, onSkip, root: parsed };
  walkJsonTokenGroup(parsed, [], tokens, context);
  return tokens;
}

function walkJsonTokenGroup(group, segments, tokens, context, inheritedType = null) {
  const { matchesKind, onSkip } = context;
  for (const [key, value] of Object.entries(group)) {
    if (isMetadataKey(key)) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const tokenEntry = tokenFromPrimitive(key, value, segments);
      if (tokenEntry && matchesKind(tokenEntry.token)) {
        tokens.push(tokenEntry);
      }
      continue;
    }

    if (!isPlainObject(value)) {
      continue;
    }

    // DTCG `$type` applies to the node and, on a group, to every token below it.
    const type = typeof value.$type === 'string' ? value.$type : inheritedType;
    const leaf = leafTokenValue(value, context.root, type);
    if (leaf !== null) {
      const token = key.startsWith('--')
        ? key
        : toCustomProperty([...segments, key]);
      if (matchesKind(token)) {
        if (leaf.value !== null) {
          tokens.push({ token, value: leaf.value });
        } else if (leaf.skipped) {
          onSkip(token, leaf.skipped);
        }
      }
      continue;
    }

    walkJsonTokenGroup(value, [...segments, key], tokens, context, type);
  }
}

function tokenFromPrimitive(key, value, segments) {
  if (key.startsWith('--')) {
    return {
      token: key,
      value: String(value),
    };
  }

  const keyAsLength = parseLengthToken(key);
  const tokenName = typeof value === 'string' ? extractTokenName(value) : null;
  if (keyAsLength && tokenName) {
    return {
      token: tokenName,
      value: key,
    };
  }

  const valueAsLength = typeof value === 'string'
    ? parseLengthToken(value)
    : typeof value === 'number'
      ? parseLengthToken(`${value}px`)
      : null;
  if (valueAsLength) {
    return {
      token: toCustomProperty([...segments, key]),
      value: typeof value === 'number' ? `${value}px` : value,
    };
  }

  return null;
}

// DTCG 2025.10 dimensions are `{ "value": 4, "unit": "px" }`; the format allows px and rem.
const DTCG_DIMENSION_UNITS = new Set(['px', 'rem']);
const JSON_REFERENCE = /^\{([^{}]+)\}$/;
const MAX_JSON_REFERENCE_DEPTH = 32;
// Raw values that are not plain JSON: a `$ref` token and a malformed dimension.
const JSON_POINTER_REF = Symbol('json pointer reference');
const INVALID_DIMENSION = Symbol('invalid dimension');

function isDimensionObject(value) {
  return isPlainObject(value)
    && typeof value.value === 'number'
    && typeof value.unit === 'string';
}

/** `{ "value": "16", "unit": "px" }` or `{ "unit": "px" }`: shaped like a dimension, not one. */
function isMalformedDimension(value) {
  return isPlainObject(value)
    && !isDimensionObject(value)
    && (Object.prototype.hasOwnProperty.call(value, 'value') || Object.prototype.hasOwnProperty.call(value, 'unit'));
}

/**
 * A DTCG 2025.10 `$ref` token: a JSON Pointer into the same file
 * (`"$ref": "#/base/$value/fontSize"`) in place of `$value`. Only a node with
 * nothing but `$` keys is one, so a group that happens to carry `$ref` is
 * still walked as a group.
 */
function jsonPointerOf(node) {
  if (typeof node.$ref !== 'string' || Object.prototype.hasOwnProperty.call(node, '$value')) {
    return null;
  }
  return Object.keys(node).every((key) => key.startsWith('$')) ? node.$ref : null;
}

/**
 * The raw value a token node holds: `$value` (DTCG, any shape), a `$ref`
 * pointer, or a string or number `value` (Style Dictionary). Undefined when
 * the node is a group or holds something other than a length (a color).
 */
function rawTokenValue(node) {
  if (!isPlainObject(node)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(node, '$value')) {
    const raw = node.$value;
    if (typeof raw === 'string' || typeof raw === 'number' || isDimensionObject(raw)) {
      return raw;
    }
    return isMalformedDimension(raw) ? { [INVALID_DIMENSION]: true } : undefined;
  }
  const pointer = jsonPointerOf(node);
  if (pointer !== null) {
    return { [JSON_POINTER_REF]: pointer };
  }
  if (isDimensionObject(node)) {
    // `{ "value": 4, "unit": "rem" }` is one dimension, not a number with metadata.
    return node;
  }
  if (typeof node.value === 'string' || typeof node.value === 'number') {
    return node.value;
  }
  return undefined;
}

/**
 * The node a reference path names: `dimension.100` is a token, and in Style
 * Dictionary's `size.base.value` the last segment is the value itself.
 */
function lookupJsonReference(root, reference) {
  let node = root;
  for (const segment of reference.split('.').map((part) => part.trim())) {
    if (!isPlainObject(node) || !Object.prototype.hasOwnProperty.call(node, segment)) {
      return undefined;
    }
    node = node[segment];
  }
  return isPlainObject(node) ? rawTokenValue(node) : node;
}

/** The value a same-file JSON Pointer (`#/a/b/0`, RFC 6901) names, or undefined. */
function lookupJsonPointer(root, pointer) {
  if (pointer === '#') {
    return root;
  }
  if (!pointer.startsWith('#/')) {
    return undefined;
  }
  let node = root;
  for (const encoded of pointer.slice(2).split('/')) {
    let segment;
    try {
      segment = decodeURIComponent(encoded).replace(/~1/g, '/').replace(/~0/g, '~');
    } catch {
      return undefined;
    }
    if (Array.isArray(node)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment) || Number(segment) >= node.length) {
        return undefined;
      }
      node = node[Number(segment)];
    } else if (isPlainObject(node) && Object.prototype.hasOwnProperty.call(node, segment)) {
      node = node[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * A `$ref` token's value. The pointer names a value inside the file, usually a
 * `$value` or a part of one. A dimension object or a string is read as any
 * `$value` is; a number is read too, except for a `dimension` token, which
 * needs the whole `{ value, unit }` object. A pointer to a color or a
 * composite is not a length and is left out quietly; one that names nothing is
 * skipped with a warning.
 */
function resolveJsonPointer(pointer, root, stack, type) {
  if (stack.has(pointer)) {
    return { skipped: `reference cycle through "${pointer}"`, value: null };
  }
  const target = lookupJsonPointer(root, pointer);
  if (target === undefined) {
    return { skipped: `reference "${pointer}" does not resolve`, value: null };
  }
  if (typeof target === 'number' && type === 'dimension') {
    return { skipped: `reference "${pointer}" is a number, not a dimension`, value: null };
  }
  if (typeof target === 'string' || typeof target === 'number' || isDimensionObject(target) || isMalformedDimension(target)) {
    stack.add(pointer);
    const resolved = resolveJsonValue(isMalformedDimension(target) ? { [INVALID_DIMENSION]: true } : target, root, stack, type);
    stack.delete(pointer);
    return resolved;
  }
  return { value: null };
}

/**
 * A raw token value as a string: a number as written, a dimension object as
 * `4px` or `0.75rem`, a reference (`{spacing.2}` or a `$ref` pointer)
 * followed through the file. A `{}` reference that cannot be followed (a
 * missing target, a cycle) keeps its text, as before, and reads as a
 * non-length; a `$ref` that cannot be followed, a dimension in another unit
 * and a malformed dimension are skipped.
 */
function resolveJsonValue(raw, root, stack = new Set(), type = null) {
  if (typeof raw === 'number') {
    return { value: String(raw) };
  }
  if (isPlainObject(raw) && raw[INVALID_DIMENSION]) {
    return { skipped: 'dimension needs a number "value" and a "unit"', value: null };
  }
  if (isPlainObject(raw) && typeof raw[JSON_POINTER_REF] === 'string') {
    return resolveJsonPointer(raw[JSON_POINTER_REF], root, stack, type);
  }
  if (isDimensionObject(raw)) {
    const unit = raw.unit.trim().toLowerCase();
    if (!Number.isFinite(raw.value) || !DTCG_DIMENSION_UNITS.has(unit)) {
      return { skipped: `dimension unit "${raw.unit}" is not px or rem`, value: null };
    }
    return { value: `${raw.value}${unit}` };
  }
  if (typeof raw !== 'string') {
    return { value: null };
  }
  const reference = raw.trim().match(JSON_REFERENCE);
  if (!reference) {
    return { value: raw };
  }
  const target = reference[1].trim();
  if (stack.has(target) || stack.size >= MAX_JSON_REFERENCE_DEPTH) {
    return { value: raw };
  }
  const next = lookupJsonReference(root, target);
  if (next === undefined || next === null) {
    return { value: raw };
  }
  stack.add(target);
  const resolved = resolveJsonValue(next, root, stack, type);
  stack.delete(target);
  if (resolved.value === null && !resolved.skipped) {
    return { value: raw };
  }
  return resolved;
}

/** The value of a token node, resolved; null when the node is a group, not a token. */
function leafTokenValue(node, root = node, type = null) {
  const raw = rawTokenValue(node);
  if (raw === undefined) {
    return null;
  }
  return resolveJsonValue(raw, root, new Set(), type);
}

function isMetadataKey(key) {
  return key.startsWith('$')
    || key === 'type'
    || key === 'description'
    || key === 'comment'
    || key === 'attributes';
}

function toCustomProperty(segments) {
  return `--${segments
    .map((segment) => String(segment).trim())
    .filter(Boolean)
    .join('-')}`;
}

function extractTokenName(value) {
  const varMatch = value.match(/var\(\s*(--[\w-]+)/);
  if (varMatch) {
    return varMatch[1];
  }

  if (value.startsWith('--')) {
    return value;
  }

  return null;
}

function addDefinition(definitions, {
  baseFontSize,
  file,
  scope = 'root',
  source,
  token,
  value,
}) {
  const entry = definitions.get(token) || {
    files: new Set(),
    normalizedValues: new Set(),
    scopes: new Set(),
    sources: new Set(),
    token,
    values: new Set(),
  };

  entry.files.add(file);
  entry.scopes.add(scope);
  entry.sources.add(source);
  entry.values.add(String(value).trim());

  for (const normalizedValue of getNormalizedValueKeys(value, baseFontSize)) {
    entry.normalizedValues.add(normalizedValue);
  }

  definitions.set(token, entry);
}

// The factor must carry a unit: `calc(4px * var(--scaling))` is a length, `calc(var(--x) * 2)` is a multiplier.
const CALC_LENGTH_TIMES_VAR = /^calc\(\s*(-?[\d.]+(?:px|rem|em))\s*\*\s*var\([^()]*\)\s*\)$/i;
const CALC_VAR_TIMES_LENGTH = /^calc\(\s*var\([^()]*\)\s*\*\s*(-?[\d.]+(?:px|rem|em))\s*\)$/i;

/**
 * Parse the length a token value carries. Accepts plain lengths and the
 * `calc(<length> * var(--factor))` form design systems use for scaling
 * (Radix Themes: `--space-1: calc(4px * var(--scaling))`).
 */
function parseTokenValueLength(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const direct = parseLengthToken(trimmed);
  if (direct) {
    return direct;
  }

  const match = trimmed.match(CALC_LENGTH_TIMES_VAR) || trimmed.match(CALC_VAR_TIMES_LENGTH);
  if (!match) {
    return null;
  }

  const inner = parseLengthToken(match[1]);
  return inner ? { ...inner, raw: trimmed } : null;
}

function getNormalizedValueKeys(value, baseFontSize = 16) {
  if (value === null || value === undefined) {
    return [];
  }

  const raw = String(value).trim();
  if (!raw) {
    return [];
  }

  const keys = new Set([raw]);
  const parsed = parseTokenValueLength(raw);
  // A non-zero number without a unit (`--space-ratio: 1.5`) is a ratio or a
  // multiplier, not a px length (issue #268). Flat-JSON numbers get their px
  // unit explicitly in tokenFromPrimitive before they reach this point.
  if (!parsed || (parsed.unit === '' && parsed.number !== 0)) {
    return Array.from(keys);
  }

  const absolute = Math.abs(parsed.number);
  keys.add(formatLength(absolute, parsed.unit || 'px'));

  const px = toPx(absolute, parsed.unit, baseFontSize);
  if (px !== null) {
    keys.add(`${px}px`);
  }

  return Array.from(keys);
}

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

module.exports = {
  createScssVariableResolver,
  evaluateScssValueList,
  VALID_TOKEN_KINDS,
  VALID_TOKEN_SOURCE_FORMATS,
  addDefinition,
  collectCssTokens,
  collectScssTokens,
  customPropertyDeclarations,
  createTokenKindMatcher,
  getNormalizedValueKeys,
  hasLineComments,
  normalizeTokenKind,
  normalizeTokenSourceFormat,
  parseTokenSources,
  parseTokenValueLength,
};
