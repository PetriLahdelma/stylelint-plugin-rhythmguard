'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  fromPx,
  nearestScaleValues,
  normalizeScale,
  normalizeScaleByUnit,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../utils/length');
const {
  buildScaleOptions,
  resolvePropertyScale,
  validateNoOffscaleTransformSecondaryOptions,
} = require('../../utils/options');
const {
  declarationValueIndex,
  isMathFunction,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../utils/value-utils');

const ruleName = 'rhythmguard/no-offscale-transform';
const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper) =>
    `Unexpected transform translation value "${value}". Use scale values (nearest: ${lower} or ${upper}).`,
});

function getFixedNodeValue(parsedLength, nearestPx, options) {
  const unit = parsedLength.unit || 'px';
  if (unit === '%' || !options.units.includes(unit)) {
    return null;
  }

  const signedNearest = parsedLength.number < 0 ? -Math.abs(nearestPx) : nearestPx;

  if (options.unitStrategy === 'exact') {
    return formatLength(signedNearest, parsedLength.unit || 'px');
  }

  const converted = fromPx(signedNearest, unit, options.baseFontSize);

  if (converted === null) {
    return null;
  }

  return formatLength(converted, unit);
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

    const validSecondaryOptions = validateNoOffscaleTransformSecondaryOptions(
      result,
      ruleName,
      secondaryOptions,
    );
    if (!validSecondaryOptions) {
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

    const scaleCache = new Map();
    const getScaleStateForProperty = (prop) => {
      const cached = scaleCache.get(prop);
      if (cached) {
        return cached;
      }

      const selectedScale = resolvePropertyScale(prop, options);
      const next = {
        scaleByUnit: normalizeScaleByUnit(selectedScale),
        scalePx: normalizeScale(selectedScale, options.baseFontSize),
      };

      scaleCache.set(prop, next);
      return next;
    };

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop !== 'transform' && prop !== 'translate' && !prop.startsWith('translate-')) {
        return;
      }

      const parsed = valueParser(decl.value);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      let changed = false;

      const report = (node, nearest, nearestUnit, fixedValue = null) => {
        const index = declarationValueIndex(decl) + node.sourceIndex;
        const endIndex = index + node.value.length;

        const payload = {
          endIndex,
          index,
          message: messages.rejected(
            node.value,
            formatLength(nearest.lower, nearestUnit),
            formatLength(nearest.upper, nearestUnit),
          ),
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

      const checkNode = (node) => {
        const parsedLength = parseLengthToken(node.value);
        if (!parsedLength || parsedLength.number === 0) {
          return;
        }

        if (parsedLength.unit === '') {
          return;
        }

        if (parsedLength.unit === '%' && options.allowPercentages) {
          return;
        }

        if (!options.allowNegative && parsedLength.number < 0) {
          return;
        }

        if (
          parsedLength.unit &&
          parsedLength.unit !== '%' &&
          !options.units.includes(parsedLength.unit)
        ) {
          return;
        }

        if (options.unitStrategy === 'exact') {
          const unit = parsedLength.unit || 'px';
          const unitScale = scaleByUnit.get(unit);
          if (!unitScale || unitScale.length === 0) {
            return;
          }

          const absoluteValue = Math.abs(parsedLength.number);
          const isOnScale = unitScale.some((entry) => numbersEqual(entry, absoluteValue));
          if (isOnScale) {
            return;
          }

          const nearest = nearestScaleValues(absoluteValue, unitScale);
          if (!nearest) {
            return;
          }

          const fixedValue = options.fixToScale
            ? getFixedNodeValue(parsedLength, nearest.nearest, options)
            : null;

          report(node, nearest, unit, fixedValue);
          changed = true;
          return;
        }

        const pxValue = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
        if (pxValue === null) {
          return;
        }

        const isOnScale = scalePx.some((entry) => numbersEqual(entry, pxValue));
        if (isOnScale) {
          return;
        }

        const nearest = nearestScaleValues(pxValue, scalePx);
        if (!nearest) {
          return;
        }

        const fixedValue = options.fixToScale
          ? getFixedNodeValue(parsedLength, nearest.nearest, options)
          : null;

        report(node, nearest, 'px', fixedValue);
        changed = true;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node, context) => {
          if (node.type === 'function') {
            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          checkNode(node);
          return false;
        });
      } else {
        walkRootValueNodes(parsed, (node, context) => {
          if (node.type === 'function') {
            if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
              return true;
            }

            return false;
          }

          if (node.type !== 'word') {
            return false;
          }

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          checkNode(node);
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
  url: 'https://github.com/petrilahdelma/stylelint-plugin-rhythmguard#rhythmguardno-offscale-transform',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
