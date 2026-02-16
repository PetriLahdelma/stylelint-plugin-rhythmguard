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
  declarationValueIndex,
  walkTransformTranslateNodes,
} = require('../../utils/value-utils');

const ruleName = 'rhythmguard/no-offscale-transform';
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (value, lower, upper) =>
    `Unexpected transform translation value "${value}". Use scale values (nearest: ${lower} or ${upper}).`,
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
    const scalePx = normalizeScale(options.scale, options.baseFontSize);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (prop !== 'transform' && prop !== 'translate' && !prop.startsWith('translate-')) {
        return;
      }

      const parsed = valueParser(decl.value);
      let changed = false;

      const report = (node, nearest, fixedValue = null) => {
        const index = declarationValueIndex(decl) + node.sourceIndex;
        const endIndex = index + node.value.length;

        const payload = {
          endIndex,
          index,
          message: messages.rejected(
            node.value,
            formatLength(nearest.lower, 'px'),
            formatLength(nearest.upper, 'px'),
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

        if (parsedLength.unit === '%' && options.allowPercentages) {
          return;
        }

        if (!options.allowNegative && parsedLength.number < 0) {
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

        report(node, nearest, fixedValue);
        changed = true;
      };

      if (prop === 'transform') {
        walkTransformTranslateNodes(parsed, (node) => {
          checkNode(node);
        });
      } else {
        for (const node of parsed.nodes) {
          if (node.type === 'word') {
            checkNode(node);
          }
        }
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
