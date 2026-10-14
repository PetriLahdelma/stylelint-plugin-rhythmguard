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

  const walkNodes = (nodes, parentFunction) => {
    let argIndex = 1;

    for (const node of nodes) {
      if (node.type === 'div' && node.value === ',') {
        argIndex += 1;
        continue;
      }

      const context = {
        parentFunctionArgIndex: parentFunction ? argIndex : null,
        parentFunctionName: parentFunction ? parentFunction.name : initialContext.parentFunctionName,
      };

      if (node.type === 'function') {
        const fnName = node.value.toLowerCase();
        const skipChildren = walkNode(node, context);

        if (skipChildren) {
          continue;
        }

        walkNodes(node.nodes, { name: fnName });
        continue;
      }

      walkNode(node, context);
    }
  };

  walkNodes(parsed.nodes, null);
}

function walkTransformTranslateNodes(parsed, walkNode) {
  const walkNodes = (nodes, parentFunction) => {
    let argIndex = 1;

    for (const node of nodes) {
      if (node.type === 'div' && node.value === ',') {
        argIndex += 1;
        continue;
      }

      const context = {
        parentFunctionArgIndex: parentFunction ? argIndex : null,
        parentFunctionName: parentFunction ? parentFunction.name : null,
      };

      if (node.type === 'function') {
        const fnName = node.value.toLowerCase();
        const skipChildren = walkNode(node, context);
        if (skipChildren) {
          continue;
        }

        walkNodes(node.nodes, { name: fnName });
        continue;
      }

      walkNode(node, context);
    }
  };

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

function declarationValueIndex(decl) {
  const declarationText = decl.toString();
  const idx = declarationText.indexOf(decl.value);
  return idx === -1 ? 0 : idx;
}

module.exports = {
  collectMathBounds,
  declarationValueIndex,
  isBoundFunction,
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
};
