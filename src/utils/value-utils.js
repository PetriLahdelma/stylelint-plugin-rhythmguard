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

  const firstArg = valueParser.stringify(node.nodes).split(',')[0].trim();
  return tokenRegex.test(firstArg);
}

function walkRootValueNodes(parsed, walkNode, state) {
  const walkNodes = (nodes, parentFunctionName) => {
    for (const node of nodes) {
      if (node.type === 'function') {
        const fnName = node.value.toLowerCase();
        const skipChildren = walkNode(node, parentFunctionName);

        if (skipChildren) {
          continue;
        }

        walkNodes(node.nodes, fnName);
        continue;
      }

      walkNode(node, parentFunctionName);
    }
  };

  walkNodes(parsed.nodes, state || null);
}

function walkTransformTranslateNodes(parsed, walkNode) {
  for (const node of parsed.nodes) {
    if (node.type !== 'function') {
      continue;
    }

    if (!TRANSLATE_FUNCTIONS.has(node.value.toLowerCase())) {
      continue;
    }

    for (const child of node.nodes) {
      if (child.type === 'word') {
        walkNode(child, node.value.toLowerCase());
      }
    }
  }
}

function isMathFunction(functionName) {
  if (!functionName) {
    return false;
  }

  return MATH_FUNCTIONS.has(functionName.toLowerCase());
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
  walkRootValueNodes,
  walkTransformTranslateNodes,
};
