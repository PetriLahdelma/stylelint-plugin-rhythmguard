'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../utils/length');
const { buildTokenOptions } = require('../../utils/options');
const {
  createTokenRegex,
  declarationValueIndex,
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../utils/value-utils');

const ruleName = 'rhythmguard/prefer-token';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value) =>
    `Unexpected raw spacing value "${value}". Use design tokens for spacing decisions.`,
});

function resolveTokenReplacement(tokenMap, raw, normalizedPx) {
  if (Object.prototype.hasOwnProperty.call(tokenMap, raw)) {
    return tokenMap[raw];
  }

  const pxKey = `${normalizedPx}px`;
  if (Object.prototype.hasOwnProperty.call(tokenMap, pxKey)) {
    return tokenMap[pxKey];
  }

  return null;
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });

    if (!valid) {
      return;
    }

    const options = buildTokenOptions(secondaryOptions);
    if (options.invalidPreset) {
      stylelint.utils.report({
        message: messages.invalidPreset(options.invalidPreset, options.presetNames),
        node: root,
        result,
        ruleName,
      });
    }

    const tokenRegex = createTokenRegex(options.tokenPattern, result, ruleName);
    const scalePx = normalizeScale(options.scale, options.baseFontSize);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) {
        return;
      }

      if (!propertyMatches(prop, options.properties)) {
        return;
      }

      const parsed = valueParser(decl.value);
      let changed = false;

      const reportNode = (node, replacement = null) => {
        const index = declarationValueIndex(decl) + node.sourceIndex;
        const endIndex = index + node.value.length;

        const payload = {
          endIndex,
          index,
          message: messages.rejected(node.value),
          node: decl,
          result,
          ruleName,
        };

        if (replacement) {
          payload.fix = () => {
            node.value = replacement;
            return true;
          };
        }

        stylelint.utils.report(payload);
      };

      const checkWordNode = (node, parentFunctionName) => {
        if (isKeyword(node.value, options.ignoreValues)) {
          return false;
        }

        if (
          parentFunctionName &&
          isMathFunction(parentFunctionName) &&
          !options.enforceInsideMathFunctions
        ) {
          return false;
        }

        const parsedLength = parseLengthToken(node.value);
        if (!parsedLength) {
          return false;
        }

        if (parsedLength.number === 0) {
          return false;
        }

        if (parsedLength.unit === '') {
          return false;
        }

        const absPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
        if (absPx === null) {
          return false;
        }

        if (options.allowNumericScale) {
          const onScale = scalePx.some((entry) => numbersEqual(entry, absPx));
          if (onScale) {
            return false;
          }
        }

        const replacement = resolveTokenReplacement(options.tokenMap, node.value, absPx);

        reportNode(node, replacement);
        return true;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node, parentFunctionName) => {
          if (node.type === 'function') {
            if (isTokenFunction(node, options.tokenFunctions, tokenRegex)) {
              return true;
            }

            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          changed = checkWordNode(node, parentFunctionName) || changed;
          return false;
        });
      } else {
        walkRootValueNodes(parsed, (node, parentFunctionName) => {
          if (node.type === 'function') {
            if (isTokenFunction(node, options.tokenFunctions, tokenRegex)) {
              return true;
            }

            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          changed = checkWordNode(node, parentFunctionName) || changed;
          return false;
        });
      }

      if (changed) {
        decl.value = parsed.toString();
      }
    });
  };
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = {
  fixable: true,
  url: 'https://github.com/petrilahdelma/stylelint-plugin-rhythmguard#rhythmguardprefer-token',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
