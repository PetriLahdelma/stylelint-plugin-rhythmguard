'use strict';

const valueParser = require('postcss-value-parser');
const stylelint = require('stylelint');
const {
  MATH_FUNCTIONS,
  TRANSLATE_FUNCTIONS,
} = require('./constants');

function propertyMatches(prop, patterns) {
  const normalized = prop.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(normalized);
    }

    return String(pattern).toLowerCase() === normalized;
  });
}

function isKeyword(value, ignoreValues) {
  return ignoreValues.includes(String(value).toLowerCase());
}

function createTokenRegex(tokenPattern, result, ruleName) {
  try {
    return new RegExp(tokenPattern);
  } catch {
    stylelint.utils.report({
      message: `Invalid tokenPattern regex: ${tokenPattern}`,
      result,
      ruleName,
    });

    return /^--space-/;
  }
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

function declarationValueIndex(decl) {
  const declarationText = decl.toString();
  const idx = declarationText.indexOf(decl.value);
  return idx === -1 ? 0 : idx;
}

module.exports = {
  createTokenRegex,
  declarationValueIndex,
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
};
