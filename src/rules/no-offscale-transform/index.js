'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  formatLength,
  isHairlineLength,
  nearestScaleValues,
  nearestText,
  numbersEqual,
  parseLengthToken,
  pxAside,
  pxOnScale,
  toPx,
} = require('../../core/length');
const {
  buildScaleOptions,
  createPropertyScaleResolver,
} = require('../../core/options');
const {
  collectMathBounds,
  declarationValueSource,
  isBoundFunction,
  isMathFunction,
  shouldLintMathArgument,
  skipTokenFunction,
  walkRootValueNodes,
  walkTransformTranslateNodes,
  writeDeclarationValue,
} = require('../../core/value-nodes');

const {
  collectTokenDefinitions,
  withResolvedScale,
} = require('../../core/scale-inference');

const { validatePrimary, validateNoOffscaleTransformSecondaryOptions } = require('../validate');

const { createTokenRegex, reportInvalidPreset, reportProblem, reportValueNode } = require('../report');
const { decisionFor, loadRcDecisions } = require('../../core/decisions');
const { replacementFor, tokenHoldsNote, tokenIndexFromDefinitions } = require('../../core/token-index');

const ruleName = 'rhythmguard/no-offscale-transform';
const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidPreset: (presetName, presetNames) =>
    `Unknown scale preset "${presetName}". Available presets: ${presetNames.join(', ')}.`,
  rejected: (value, lower, upper, note = '', position = null, aside = '') =>
    `Unexpected transform translation ${position ? `${position} "${value}"${aside}` : `value "${value}"`}. Use scale values (${nearestText(lower, upper)}).${note ? ` ${note}` : ''}`,
  // A value the options forbid outright has no nearest scale value to name (issue #274).
  rejectedNegative: (value, note = '', position = null) =>
    `Unexpected transform translation ${position || 'value'} "${value}". Negative values are disabled for this rule.${note ? ` ${note}` : ''}`,
  rejectedPercentage: (value, note = '', position = null) =>
    `Unexpected transform translation ${position || 'value'} "${value}". Percentages are disabled for this rule.${note ? ` ${note}` : ''}`,
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
    try {
      options.decisions = options.readDecisions ? loadRcDecisions(process.cwd(), { baseFontSize: options.baseFontSize }) : [];
    } catch (error) {
      reportProblem(error.message, { result, root, ruleName });
      options.decisions = [];
    }

    withResolvedScale(options, root);
    const tokenRegex = createTokenRegex(options.tokenPattern, { result, root, ruleName });
    if (options.fixWith === 'token') {
      options.tokenIndex = tokenIndexFromDefinitions(
        collectTokenDefinitions({
          baseFontSize: options.baseFontSize,
          root,
          scaleSources: options.scaleSources,
          tokenPattern: options.tokenPatternExplicit ? options.tokenPattern : null,
          tokenRegex,
        }),
        options.baseFontSize,
      );
    }

    const getScaleStateForProperty = createPropertyScaleResolver(options);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop !== 'transform' && prop !== 'translate' && !prop.startsWith('translate-')) {
        return;
      }

      const source = declarationValueSource(decl);
      const parsed = valueParser(source.parseText);
      const { scaleByUnit, scalePx } = getScaleStateForProperty(prop);
      let changed = false;

      // `position` names a clamp(), min() or max() bound (issue #272).
      const report = (node, nearest, nearestUnit, fixedValue = null, position = null) => {
        reportValueNode({
          decl,
          message: messages.rejected(
            node.value,
            formatLength(nearest.lower, nearestUnit),
            formatLength(nearest.upper, nearestUnit),
            [tokenHoldsNote(fixedValue, formatLength(nearest.nearest, nearestUnit), node.value.trim().startsWith('-')), options.note].filter(Boolean).join(' '),
            position,
            position ? pxAside(node.value, options.baseFontSize) : '',
          ),
          node,
          replacement: fixedValue,
          result,
          ruleName,
        });
      };

      // A value the options forbid outright says so, with no fix (issue #274).
      const reportForbidden = (node, message, position) => {
        reportValueNode({ decl, message: message(node.value, options.note, position), node, result, ruleName });
      };

      const checkNode = (node, avoidTokens = [], position = null) => {
        const parsedLength = parseLengthToken(node.value);
        if (!parsedLength || parsedLength.number === 0) {
          return;
        }

        if (parsedLength.unit === '') {
          return;
        }

        if (parsedLength.unit === '%') {
          if (!options.allowPercentages) {
            reportForbidden(node, messages.rejectedPercentage, position);
          }
          return;
        }

        if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
          return;
        }

        if (!options.allowNegative && parsedLength.number < 0) {
          reportForbidden(node, messages.rejectedNegative, position);
          return;
        }

        if (
          parsedLength.unit &&
          parsedLength.unit !== '%' &&
          !options.units.includes(parsedLength.unit)
        ) {
          return;
        }

        const decidedPx = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
        const decision = decidedPx === null ? null : decisionFor(decidedPx, prop, options.decisions);
        if (decision && (decision.decision === 'adopt' || decision.decision === 'allow')) {
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
            ? replacementFor(parsedLength, nearest.nearest, options, decl.prop, avoidTokens)
            : null;

          report(node, nearest, unit, fixedValue, position);
          changed = true;
          return;
        }

        const pxValue = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
        if (pxValue === null) {
          return;
        }

        const isOnScale = pxOnScale(scalePx, pxValue, parsedLength.unit, options.baseFontSize);
        if (isOnScale) {
          return;
        }

        const nearest = nearestScaleValues(pxValue, scalePx);
        if (!nearest) {
          return;
        }

        const fixedValue = options.fixToScale
          ? replacementFor(parsedLength, nearest.nearest, options, decl.prop, avoidTokens)
          : null;

        report(node, nearest, 'px', fixedValue, position);
        changed = true;
      };

      // The bounds of clamp(), min() and max() are checked as in use-scale
      // (issue #272).
      const checkedBounds = new Set();
      const visit = (node, context) => {
        if (node.type === 'function') {
          const skipToken = skipTokenFunction(node, options.tokenFunctions, tokenRegex);
          if (skipToken) {
            return skipToken;
          }

          if (options.checkMathBounds && isBoundFunction(node)) {
            for (const bound of collectMathBounds(node)) {
              if (!checkedBounds.has(bound.node)) {
                checkedBounds.add(bound.node);
                checkNode(bound.node, context.tokenFallbackOf, bound.position);
              }
            }
          }

          if (isMathFunction(node.value) && !options.enforceInsideMathFunctions) {
            return true;
          }

          return false;
        }

        if (node.type !== 'word' || checkedBounds.has(node)) {
          return false;
        }

        if (!shouldLintMathArgument(context, options)) {
          return false;
        }

        checkNode(node, context.tokenFallbackOf);
        return false;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, visit);
      } else {
        walkRootValueNodes(parsed, visit);
      }

      if (changed) {
        writeDeclarationValue(decl, source, parsed);
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
