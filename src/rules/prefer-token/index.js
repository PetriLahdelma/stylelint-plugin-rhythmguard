'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  isHairlineLength,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../core/length');
const {
  buildTokenOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../core/value-nodes');
const { buildEffectiveTokenMap } = require('../../core/token-map');

const {
  withResolvedScale,
} = require('../../core/scale-inference');

const { createTokenRegex, reportInvalidPreset, reportValueNode } = require('../report');
const { validatePrimary, validatePreferTokenSecondaryOptions } = require('../validate');

const { negateReplacement } = require('../../core/token-index');

const ruleName = 'rhythmguard/prefer-token';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, replacement = null, origin = null) =>
    `Unexpected raw scale value "${value}". ${replacement
      ? `Use ${replacement}${origin ? ` (${origin})` : ''}.`
      : 'No known token holds this value; use the nearest token or add one.'}`,
});

function applyNegativeToken(replacement, parsedLength) {
  return !replacement || parsedLength.number >= 0 ? replacement : negateReplacement(replacement);
}

/** The token for a raw length, and the text the fix writes (negated when the literal is). */
function resolveTokenReplacement(tokenMap, raw, parsedLength, options) {
  const found = (token) => ({ replacement: applyNegativeToken(token, parsedLength), token });

  if (Object.prototype.hasOwnProperty.call(tokenMap, raw)) {
    return found(tokenMap[raw]);
  }

  const absoluteRaw = formatLength(Math.abs(parsedLength.number), parsedLength.unit || 'px');
  if (Object.prototype.hasOwnProperty.call(tokenMap, absoluteRaw)) {
    return found(tokenMap[absoluteRaw]);
  }

  if (options.unitStrategy === 'convert') {
    const absPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
    if (absPx !== null) {
      const pxKey = `${absPx}px`;
      if (Object.prototype.hasOwnProperty.call(tokenMap, pxKey)) {
        return found(tokenMap[pxKey]);
      }
    }
  }

  return null;
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = validatePrimary(result, ruleName, primary);

    if (!valid) {
      return;
    }

    const validSecondaryOptions = validatePreferTokenSecondaryOptions(
      result,
      ruleName,
      secondaryOptions,
    );
    if (!validSecondaryOptions) {
      return;
    }

    const options = buildTokenOptions(secondaryOptions);
    reportInvalidPreset(options, { message: messages.invalidPreset, result, root, ruleName });

    withResolvedScale(options, root);

    const tokenRegex = createTokenRegex(options.tokenPattern, result, ruleName);
    const origins = {};
    const tokenMap = buildEffectiveTokenMap({
      options,
      origins,
      root,
      tokenRegex,
    });

    const getScaleStateForProperty = createPropertyScaleResolver(options);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) {
        return;
      }

      if (!propertyMatches(prop, options.properties)) {
        return;
      }

      const parsed = valueParser(decl.value);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      let changed = false;

      const reportNode = (node, resolved = null) => {
        const replacement = resolved ? resolved.replacement : null;
        const origin = resolved ? origins[resolved.token] || null : null;
        reportValueNode({ decl, message: messages.rejected(node.value, replacement, origin), node, replacement, result, ruleName });
      };

      const checkWordNode = (node, context) => {
        if (isKeyword(node.value, options.ignoreValues)) {
          return false;
        }

        if (!shouldLintMathArgument(context, options)) {
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

        // Percentages are relative to the container or the element itself; they are
        // never spacing-token candidates (translate(-50%, -50%) centering, inset: 100%).
        if (parsedLength.unit === '%') {
          return false;
        }

        if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
          return false;
        }

        if (
          parsedLength.unit &&
          parsedLength.unit !== '%' &&
          !options.units.includes(parsedLength.unit)
        ) {
          return false;
        }

        if (options.allowNumericScale) {
          if (options.unitStrategy === 'exact') {
            const unit = parsedLength.unit || 'px';
            const unitScale = scaleByUnit.get(unit);
            if (unitScale && unitScale.length > 0) {
              const onScale = unitScale.some((entry) =>
                numbersEqual(entry, Math.abs(parsedLength.number)),
              );
              if (onScale) {
                return false;
              }
            }
          } else {
            const absPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
            if (absPx !== null) {
              const onScale = scalePx.some((entry) => numbersEqual(entry, absPx));
              if (onScale) {
                return false;
              }
            }
          }
        }

        reportNode(node, resolveTokenReplacement(tokenMap, node.value, parsedLength, options));
        return true;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node, context) => {
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

          changed = checkWordNode(node, context) || changed;
          return false;
        });
      } else {
        walkRootValueNodes(parsed, (node, context) => {
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

          changed = checkWordNode(node, context) || changed;
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
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/prefer-token.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
