'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  fixedLengthValue,
  formatLength,
  isHairlineLength,
  nearestScaleValues,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../core/length');
const {
  buildScaleOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
  isMathFunction,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../core/value-nodes');

const {
  withResolvedScale,
} = require('../../core/scale-inference');

const { validatePrimary, validateNoOffscaleTransformSecondaryOptions } = require('../validate');

const { reportInvalidPreset, reportValueNode } = require('../report');

const ruleName = 'rhythmguard/no-offscale-transform';
const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper) =>
    `Unexpected transform translation value "${value}". Use scale values (nearest: ${lower} or ${upper}).`,
});

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = validatePrimary(result, ruleName, primary);

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
    reportInvalidPreset(options, { message: messages.invalidPreset, result, root, ruleName });

    withResolvedScale(options, root);

    const getScaleStateForProperty = createPropertyScaleResolver(options);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop !== 'transform' && prop !== 'translate' && !prop.startsWith('translate-')) {
        return;
      }

      const parsed = valueParser(decl.value);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      let changed = false;

      const report = (node, nearest, nearestUnit, fixedValue = null) => {
        reportValueNode({
          decl,
          message: messages.rejected(
            node.value,
            formatLength(nearest.lower, nearestUnit),
            formatLength(nearest.upper, nearestUnit),
          ),
          node,
          replacement: fixedValue,
          result,
          ruleName,
        });
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

        if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
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
            ? fixedLengthValue(parsedLength, nearest.nearest, options)
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
          ? fixedLengthValue(parsedLength, nearest.nearest, options)
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
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/no-offscale-transform.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
