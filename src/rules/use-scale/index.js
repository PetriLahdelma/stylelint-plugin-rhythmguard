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
  isKeyword,
  isMathFunction,
  isTokenFunction,
  propertyMatches,
  shouldLintMathArgument,
  walkRootValueNodes,
  walkTransformTranslateNodes,
} = require('../../core/value-nodes');

const {
  autoScaleFallbackNote,
  withResolvedScale,
} = require('../../core/scale-inference');

const { createTokenRegex, reportInvalidPreset, reportValueNode } = require('../report');
const { validatePrimary, validateUseScaleSecondaryOptions } = require('../validate');

const ruleName = 'rhythmguard/use-scale';

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper, note = '') =>
    `Unexpected off-scale value "${value}". Use scale values (nearest: ${lower} or ${upper}).${note ? ` ${note}` : ''}`,
});

function checkLengthValue({
  decl,
  node,
  options,
  report,
  scaleByUnit,
  scalePx,
}) {
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

  if (parsedLength.unit === '%') {
    if (options.allowPercentages) {
      return false;
    }

    report(node.value, decl, node, null, null, '%');
    return false;
  }

  if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
    return false;
  }

  if (!options.allowNegative && parsedLength.number < 0) {
    report(node.value, decl, node, null, null, parsedLength.unit || 'px');
    return false;
  }

  if (
    parsedLength.unit &&
    parsedLength.unit !== '%' &&
    !options.units.includes(parsedLength.unit)
  ) {
    return false;
  }

  if (options.unitStrategy === 'exact') {
    const unit = parsedLength.unit || 'px';
    const unitScale = scaleByUnit.get(unit);

    if (!unitScale || unitScale.length === 0) {
      return false;
    }

    const absoluteValue = Math.abs(parsedLength.number);
    const isOnScale = unitScale.some((entry) => numbersEqual(entry, absoluteValue));
    if (isOnScale) {
      return false;
    }

    const nearest = nearestScaleValues(absoluteValue, unitScale);
    if (!nearest) {
      return false;
    }

    const fixedValue = options.fixToScale
      ? fixedLengthValue(parsedLength, nearest.nearest, options)
      : null;

    report(node.value, decl, node, nearest, fixedValue, unit);
    return true;
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
    ? fixedLengthValue(parsedLength, nearest.nearest, options)
    : null;

  report(node.value, decl, node, nearest, fixedValue, 'px');
  return true;
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = validatePrimary(result, ruleName, primary);

    if (!valid) {
      return;
    }

    const validSecondaryOptions = validateUseScaleSecondaryOptions(
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

    const tokenRegex = createTokenRegex(options.tokenPattern, result, ruleName);
    let fallbackNote = autoScaleFallbackNote(options.scaleInference);
    const getScaleStateForProperty = createPropertyScaleResolver(options);

    const report = (value, decl, node, nearest, fixedValue = null, nearestUnit = 'px') => {
      const lower = nearest ? formatLength(nearest.lower, nearestUnit) : 'n/a';
      const upper = nearest ? formatLength(nearest.upper, nearestUnit) : 'n/a';
      reportValueNode({
        decl,
        message: messages.rejected(value, lower, upper, fallbackNote),
        node,
        replacement: fixedValue,
        result,
        ruleName,
      });
      fallbackNote = '';
    };

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop.startsWith('--')) {
        return;
      }

      if (!propertyMatches(prop, options.properties)) {
        return;
      }

      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      const parsed = valueParser(decl.value);
      let changed = false;

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

          if (isKeyword(node.value, options.ignoreValues)) {
            return false;
          }

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          changed =
            checkLengthValue({
              decl,
              node,
              options,
              report,
              scaleByUnit,
              scalePx,
            }) || changed;

          return false;
        });
      } else {
        walkRootValueNodes(parsed, (node, context) => {

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

          if (!shouldLintMathArgument(context, options)) {
            return false;
          }

          changed =
            checkLengthValue({
              decl,
              node,
              options,
              report,
              scaleByUnit,
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
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/use-scale.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
