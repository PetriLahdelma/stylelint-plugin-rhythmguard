'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  fromPx,
  nearestScaleValues,
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../utils/length');
const { buildScaleOptions } = require('../../utils/options');
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

const ruleName = 'rhythmguard/use-scale';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper) =>
    `Unexpected off-scale spacing value "${value}". Use spacing scale values (nearest: ${lower} or ${upper}).`,
});

function getFixedNodeValue(parsedLength, nearestPx, options) {
  const unit = parsedLength.unit || 'px';

  if (unit === '%' || !options.units.includes(unit)) {
    return null;
  }

  const signedNearest = parsedLength.number < 0 ? -Math.abs(nearestPx) : nearestPx;
  const converted = fromPx(signedNearest, unit, options.baseFontSize);

  if (converted === null) {
    return null;
  }

  return formatLength(converted, unit);
}

function checkLengthValue({
  decl,
  node,
  options,
  report,
  scalePx,
}) {
  const parsedLength = parseLengthToken(node.value);

  if (!parsedLength) {
    return false;
  }

  if (parsedLength.number === 0) {
    return false;
  }

  if (parsedLength.unit === '%' && options.allowPercentages) {
    return false;
  }

  if (!options.allowNegative && parsedLength.number < 0) {
    report(node.value, decl, node);
    return false;
  }

  if (
    parsedLength.unit &&
    parsedLength.unit !== '%' &&
    !options.units.includes(parsedLength.unit)
  ) {
    return false;
  }

  const pxValue = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);

  if (pxValue === null) {
    return false;
  }

  const isOnScale = scalePx.some((scaleValue) => numbersEqual(scaleValue, pxValue));
  if (isOnScale) {
    return false;
  }

  const nearest = nearestScaleValues(pxValue, scalePx);
  if (!nearest) {
    return false;
  }

  const fixedValue = options.fixToScale
    ? getFixedNodeValue(parsedLength, nearest.nearest, options)
    : null;

  report(node.value, decl, node, nearest, fixedValue);
  return true;
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

    const options = buildScaleOptions(secondaryOptions);
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

    const report = (value, decl, node, nearest, fixedValue = null) => {
      const index = declarationValueIndex(decl) + node.sourceIndex;
      const endIndex = index + node.value.length;
      const lower = nearest ? formatLength(nearest.lower, 'px') : 'n/a';
      const upper = nearest ? formatLength(nearest.upper, 'px') : 'n/a';

      const payload = {
        endIndex,
        index,
        message: messages.rejected(value, lower, upper),
        node: decl,
        result,
        ruleName,
      };

      if (fixedValue) {
        payload.fix = () => {
          node.value = fixedValue;
          return true;
        };
      }

      stylelint.utils.report(payload);
    };

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

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node) => {
          changed =
            checkLengthValue({
              decl,
              node,
              options,
              report,
              scalePx,
            }) || changed;
        });
      } else {
        walkRootValueNodes(parsed, (node, parentFunctionName) => {
          if (node.type === 'function') {
            if (isTokenFunction(node, options.tokenFunctions, tokenRegex)) {
              return true;
            }

            if (
              isMathFunction(node.value) &&
              !options.enforceInsideMathFunctions
            ) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

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

          changed =
            checkLengthValue({
              decl,
              node,
              options,
              report,
              scalePx,
            }) || changed;

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
  url: 'https://github.com/petrilahdelma/stylelint-plugin-rhythmguard#rhythmguarduse-scale',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
