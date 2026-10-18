'use strict';

const valueParser = require('postcss-value-parser');
const {
  MATH_FUNCTIONS,
  TRANSLATE_FUNCTIONS,
} = require('./css-vocabulary');

function propertyMatches(prop, patterns) {
  const normalized = prop.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      if (pattern.global || pattern.sticky) {
        pattern.lastIndex = 0;
      }

      return pattern.test(normalized);
    }

    return String(pattern).toLowerCase() === normalized;
  });
}

function isKeyword(value, ignoreValues) {
  return ignoreValues.includes(String(value).toLowerCase());
}

function isTokenFunction(node, tokenFunctions, tokenRegex) {
  if (node.type !== 'function') {
    return false;
  }

  const fn = node.value.toLowerCase();
  if (!tokenFunctions.includes(fn)) {
    return false;
  }

  if (fn !== 'var') {
    return true;
  }

  const firstArgNodes = [];
  for (const child of node.nodes) {
    if (child.type === 'div' && child.value === ',') {
      break;
    }

    firstArgNodes.push(child);
  }

  const firstArg = valueParser.stringify(firstArgNodes).trim();
  return tokenRegex.test(firstArg);
}

// What a walker's callback returns for a token var(): skip the name, walk the fallback.
const WALK_TOKEN_FALLBACK = 'fallback';

/**
 * How a length rule walks a token function (issue #240). The name of a token
 * var() is the token and is skipped, but its fallback is a value like any
 * other and is walked, so `var(--space-1, 7px)` checks the 7px. Any other
 * token function (theme(), token()) is skipped whole. False for a function
 * that is not a token.
 */
function skipTokenFunction(node, tokenFunctions, tokenRegex) {
  if (!isTokenFunction(node, tokenFunctions, tokenRegex)) {
    return false;
  }

  return node.value.toLowerCase() === 'var' ? WALK_TOKEN_FALLBACK : true;
}

function varName(node) {
  const comma = node.nodes.findIndex((child) => child.type === 'div' && child.value === ',');
  return valueParser.stringify(comma === -1 ? node.nodes : node.nodes.slice(0, comma)).trim();
}

function varFallbackNodes(node) {
  const comma = node.nodes.findIndex((child) => child.type === 'div' && child.value === ',');
  return comma === -1 ? [] : node.nodes.slice(comma + 1);
}

/**
 * Walk value nodes for a length rule. `walkNode` returns true to skip a
 * function's children, or WALK_TOKEN_FALLBACK to walk only the fallback of a
 * var(). Nodes inside a fallback carry `tokenFallbackOf`, the names of the
 * var()s they fall back from, outermost first.
 */
function createNodeWalker(walkNode, rootFunctionName = null) {
  const walkNodes = (nodes, parentFunction, firstArgIndex = 1, tokenFallbackOf = []) => {
    let argIndex = firstArgIndex;

    for (const node of nodes) {
      if (node.type === 'div' && node.value === ',') {
        argIndex += 1;
        continue;
      }

      const context = {
        parentFunctionArgIndex: parentFunction ? argIndex : null,
        parentFunctionName: parentFunction ? parentFunction.name : rootFunctionName,
        tokenFallbackOf,
      };

      if (node.type === 'function') {
        const fnName = node.value.toLowerCase();
        const skipChildren = walkNode(node, context);

        if (skipChildren === WALK_TOKEN_FALLBACK) {
          walkNodes(varFallbackNodes(node), { name: fnName }, 2, [...tokenFallbackOf, varName(node)]);
          continue;
        }

        if (skipChildren) {
          continue;
        }

        walkNodes(node.nodes, { name: fnName }, 1, tokenFallbackOf);
        continue;
      }

      walkNode(node, context);
    }
  };

  return walkNodes;
}

function normalizeWalkContext(context) {
  if (!context) {
    return {
      parentFunctionArgIndex: null,
      parentFunctionName: null,
    };
  }

  if (typeof context === 'string') {
    return {
      parentFunctionArgIndex: null,
      parentFunctionName: context,
    };
  }

  return {
    parentFunctionArgIndex:
      Number.isInteger(context.parentFunctionArgIndex) && context.parentFunctionArgIndex > 0
        ? context.parentFunctionArgIndex
        : null,
    parentFunctionName:
      typeof context.parentFunctionName === 'string' && context.parentFunctionName.length > 0
        ? context.parentFunctionName
        : null,
  };
}

function walkRootValueNodes(parsed, walkNode, state) {
  const initialContext = normalizeWalkContext(state);
  createNodeWalker(walkNode, initialContext.parentFunctionName)(parsed.nodes, null);
}

function walkTransformTranslateNodes(parsed, walkNode) {
  const walkNodes = createNodeWalker(walkNode);

  for (const node of parsed.nodes) {
    if (node.type !== 'function') {
      continue;
    }

    if (!TRANSLATE_FUNCTIONS.has(node.value.toLowerCase())) {
      continue;
    }

    walkNodes(node.nodes, { name: node.value.toLowerCase() });
  }
}

function isMathFunction(functionName) {
  if (!functionName) {
    return false;
  }

  return MATH_FUNCTIONS.has(functionName.toLowerCase());
}

function shouldLintMathArgument(context, options) {
  const functionName = (context && context.parentFunctionName) || null;
  const argumentIndex = (context && context.parentFunctionArgIndex) || null;

  if (!functionName || !isMathFunction(functionName)) {
    return true;
  }

  if (!options.enforceInsideMathFunctions) {
    return false;
  }

  const include = options.mathFunctionArguments[functionName];
  if (include && include.length > 0) {
    return include.includes(argumentIndex);
  }

  const ignore = options.ignoreMathFunctionArguments[functionName];
  if (ignore && ignore.length > 0) {
    return !ignore.includes(argumentIndex);
  }

  return true;
}

const BOUND_FUNCTIONS = new Set(['clamp', 'min', 'max']);

function isBoundFunction(node) {
  return node.type === 'function' && BOUND_FUNCTIONS.has(node.value.toLowerCase());
}

function splitArguments(nodes) {
  const args = [[]];
  for (const node of nodes) {
    if (node.type === 'div' && node.value === ',') {
      args.push([]);
      continue;
    }
    if (node.type !== 'space' && node.type !== 'comment') {
      args[args.length - 1].push(node);
    }
  }
  return args;
}

/**
 * The static bounds of a fluid value (issue #203): the minimum and maximum of
 * `clamp(MIN, VAL, MAX)` and every argument of `min()` and `max()`. A bound
 * counts only when it is one word, a length literal; the preferred value of
 * clamp(), an expression, or a var() is fluid by design and left alone. A
 * bound that is itself min(), max() or clamp() is followed.
 */
function collectMathBounds(fnNode) {
  const name = fnNode.value.toLowerCase();
  const args = splitArguments(fnNode.nodes);
  const positioned = name === 'clamp'
    ? (args.length === 3 ? [[args[0], 'clamp() minimum'], [args[2], 'clamp() maximum']] : [])
    : args.map((arg) => [arg, `${name}() argument`]);

  const bounds = [];
  for (const [arg, position] of positioned) {
    if (arg.length !== 1) {
      continue;
    }
    const [node] = arg;
    if (node.type === 'word') {
      bounds.push({ node, position });
    } else if (isBoundFunction(node)) {
      bounds.push(...collectMathBounds(node));
    }
  }
  return bounds;
}

const SASS_OPERATORS = new Set(['*', '+', '-', '%']);

function isSassOperator(node) {
  return Boolean(node) && (
    (node.type === 'word' && SASS_OPERATORS.has(node.value)) ||
    (node.type === 'div' && node.value === '/')
  );
}

/**
 * The words of a Sass value that are operands of an expression (issue #234):
 * next to `*`, `/`, `+`, `-` or `%`, or an argument of a Sass module function
 * such as math.div(). Rewriting one changes what the expression computes, so
 * a rule may report such a literal but never fix it. Empty for a value
 * without `$`, which is not a Sass expression.
 */
function sassOperandNodes(parsed, value) {
  const operands = new Set();
  if (!String(value).includes('$')) {
    return operands;
  }

  const visit = (nodes, inModuleFunction) => {
    const meaningful = nodes.filter((node) => node.type !== 'space' && node.type !== 'comment');
    meaningful.forEach((node, index) => {
      if (node.type === 'function') {
        visit(node.nodes, inModuleFunction || node.value.includes('.'));
        return;
      }
      if (node.type !== 'word' || isSassOperator(node)) {
        return;
      }
      if (inModuleFunction || isSassOperator(meaningful[index - 1]) || isSassOperator(meaningful[index + 1])) {
        operands.add(node);
      }
    });
  };
  visit(parsed.nodes, false);
  return operands;
}

/**
 * Where the value starts inside the declaration as written: after the
 * property and the colon with its spacing.
 */
function declarationValueIndex(decl) {
  const between = decl.raws && typeof decl.raws.between === 'string' ? decl.raws.between : null;
  if (between !== null && typeof decl.prop === 'string') {
    return decl.prop.length + between.length;
  }
  const declarationText = decl.toString();
  const idx = declarationText.indexOf(decl.value);
  return idx === -1 ? 0 : idx;
}

/**
 * Blank the Sass inline comments of `scss` (the value as written) with spaces
 * of the same length, so a parser never reads `// was 13px` as a value and
 * every offset still points into the written text. postcss-scss keeps the
 * value with each inline comment turned into a block comment in `raw`; the
 * two are walked side by side so only real inline comments are blanked. Null
 * when they do not line up.
 */
function blankScssInlineComments(scss, raw) {
  let masked = '';
  const comments = [];
  let i = 0;
  let j = 0;
  while (j < scss.length) {
    if (scss.startsWith('//', j) && raw.startsWith('/*', i)) {
      let end = j + 2;
      while (end < scss.length && !/[\n\r\f]/.test(scss[end])) end += 1;
      const converted = `/*${scss.slice(j + 2, end).replace(/(\*\/|\/\*)/g, '*//*')}*/`;
      if (raw.startsWith(converted, i)) {
        comments.push({ end, start: j });
        masked += ' '.repeat(end - j);
        i += converted.length;
        j = end;
        continue;
      }
    }
    if (scss[j] !== raw[i]) {
      return null;
    }
    masked += scss[j];
    i += 1;
    j += 1;
  }
  return i === raw.length ? { comments, masked } : null;
}

/**
 * The value of a declaration as written in the source (issue #233). PostCSS
 * strips the comments from `decl.value` and keeps the written value in
 * `raws.value.raw` (and postcss-scss keeps `//` comments in `raws.value.scss`),
 * so offsets into `decl.value` point at the wrong character and writing
 * `decl.value` drops the comments. Rules parse `parseText`, whose offsets are
 * offsets into `text`, and write fixes back with writeDeclarationValue().
 */
function declarationValueSource(decl) {
  const raws = decl.raws && decl.raws.value;
  if (!raws || typeof raws.raw !== 'string' || raws.value !== decl.value) {
    return { kind: 'value', parseText: decl.value, text: decl.value };
  }
  if (typeof raws.scss === 'string') {
    const blanked = blankScssInlineComments(raws.scss, raws.raw);
    if (blanked) {
      return { comments: blanked.comments, kind: 'scss', parseText: blanked.masked, text: raws.scss };
    }
  }
  return { kind: 'raw', parseText: raws.raw, text: raws.raw };
}

/**
 * `text` with every block comment blanked with spaces of the same length, for
 * code that reads the value as an expression and cannot skip comments.
 */
function blankBlockComments(text) {
  const parsed = valueParser(text);
  let blanked = text;
  parsed.walk((node) => {
    if (node.type === 'comment') {
      const end = node.sourceEndIndex;
      blanked = `${blanked.slice(0, node.sourceIndex)}${' '.repeat(end - node.sourceIndex)}${blanked.slice(end)}`;
    }
  });
  return blanked;
}

/** The edits a walk made to the parsed value, as spans of the parsed text. */
function collectValueEdits(nodes, parseText, edits) {
  for (const node of nodes) {
    const original = parseText.slice(node.sourceIndex, node.sourceEndIndex);
    const current = valueParser.stringify(node);
    if (current === original) {
      continue;
    }
    if (node.type === 'function' && Array.isArray(node.nodes) && original.startsWith(`${node.value}(`)) {
      collectValueEdits(node.nodes, parseText, edits);
      continue;
    }
    edits.push({ end: node.sourceEndIndex, start: node.sourceIndex, text: current });
  }
  return edits;
}

/** The value PostCSS keeps in `decl.value`: a comment next to whitespace or an edge is dropped. */
function cleanValue(raw) {
  const drops = [];
  valueParser(raw).walk((node) => {
    if (node.type !== 'comment') return;
    const before = raw[node.sourceIndex - 1];
    const after = raw[node.sourceEndIndex];
    if (before === undefined || after === undefined || /\s/.test(before) || /\s/.test(after)) {
      drops.push(node);
    }
  });
  let clean = raw;
  for (const node of drops.reverse()) {
    clean = `${clean.slice(0, node.sourceIndex)}${clean.slice(node.sourceEndIndex)}`;
  }
  return clean;
}

/**
 * Write edits ({ start, end, text } spans of `source.text`) into the
 * declaration and keep the comments of the value as written (issue #233).
 * Returns whether anything changed.
 */
function writeValueEdits(decl, source, edits) {
  if (edits.length === 0) {
    return false;
  }

  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let text = source.text;
  for (const edit of ordered) {
    text = `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`;
  }

  if (source.kind === 'value') {
    decl.value = text;
    return true;
  }

  let raw = text;
  if (source.kind === 'scss') {
    // The inline comments moved by the edits before them; turn each back into
    // the block comment postcss-scss keeps in `raw`.
    const shift = (offset) => ordered.reduce((sum, edit) => (edit.end <= offset ? sum + edit.text.length - (edit.end - edit.start) : sum), 0);
    for (const comment of [...source.comments].reverse()) {
      const start = comment.start + shift(comment.start);
      const end = comment.end + shift(comment.start);
      const body = text.slice(start + 2, end).replace(/(\*\/|\/\*)/g, '*//*');
      raw = `${raw.slice(0, start)}/*${body}*/${raw.slice(end)}`;
    }
  }

  const clean = cleanValue(raw);
  decl.value = clean;
  decl.raws.value = source.kind === 'scss' ? { raw, scss: text, value: clean } : { raw, value: clean };
  return true;
}

/** Write the nodes a walk changed in `parsed` (parsed from `source.parseText`) back into the declaration. */
function writeDeclarationValue(decl, source, parsed) {
  return writeValueEdits(decl, source, collectValueEdits(parsed.nodes, source.parseText, []));
}

module.exports = {
  WALK_TOKEN_FALLBACK,
  blankBlockComments,
  collectMathBounds,
  declarationValueIndex,
  declarationValueSource,
  isBoundFunction,
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  sassOperandNodes,
  shouldLintMathArgument,
  skipTokenFunction,
  walkRootValueNodes,
  walkTransformTranslateNodes,
  writeDeclarationValue,
  writeValueEdits,
};
