'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  nearestScaleValues,
  numbersEqual,
} = require('../../core/length');
const {
  declarationValueIndex,
  walkRootValueNodes,
} = require('../../core/value-nodes');
const {
  formatTime,
  fromMs,
  normalizeDurationScale,
  normalizeDurationUnits,
  parseTimeToken,
  toMs,
} = require('../../core/time');

const ruleName = 'rhythmguard/use-motion-scale';
const DURATION_PROPERTIES = new Set([
  'transition-duration',
  'transition-delay',
  'animation-duration',
  'animation-delay',
  'transition',
  'animation',
]);
const EASING_PROPERTIES = new Set([
  'transition-timing-function',
  'animation-timing-function',
  'transition',
  'animation',
]);
const EASING_FUNCTIONS = new Set(['cubic-bezier', 'linear', 'steps']);

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidDuration: (value) =>
    `Unexpected negative motion duration "${value}". Use non-negative duration values.`,
  rejectedDuration: (value, lower, upper) =>
    `Unexpected motion duration "${value}". Use duration scale values (nearest: ${lower} or ${upper}).`,
  rejectedEasing: (value) =>
    `Unexpected raw motion easing "${value}". Use motion tokens for easing decisions.`,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildOptions(rawOptions) {
  const options = rawOptions || {};

  return {
    durationScale: normalizeDurationScale(options.durationScale),
    durationUnits: normalizeDurationUnits(options.durationUnits),
    easingTokenMap: isPlainObject(options.easingTokenMap) ? options.easingTokenMap : {},
    fixToScale: options.fixToScale !== false,
  };
}

function validateSecondaryOptions(result, secondaryOptions) {
  return stylelint.utils.validateOptions(result, ruleName, {
    actual: secondaryOptions,
    optional: true,
    possible: {
      durationScale: [(value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0],
      durationUnits: [(value) => value === 'ms' || value === 's'],
      easingTokenMap: [(value) =>
        isPlainObject(value) &&
        Object.values(value).every((entry) =>
          typeof entry === 'string' && entry.trim().length > 0,
        )],
      fixToScale: [true, false],
    },
  });
}

function getFixedNodeValue(parsedTime, nearestMs, options) {
  if (!options.durationUnits.includes(parsedTime.unit)) {
    return null;
  }

  const converted = fromMs(nearestMs, parsedTime.unit);
  if (converted === null) {
    return null;
  }

  return formatTime(converted, parsedTime.unit);
}

function functionToString(node) {
  return valueParser.stringify(node);
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    const valid = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true],
    });

    if (!valid || !validateSecondaryOptions(result, secondaryOptions)) {
      return;
    }

    const options = buildOptions(secondaryOptions);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (!DURATION_PROPERTIES.has(prop) && !EASING_PROPERTIES.has(prop)) {
        return;
      }

      const parsed = valueParser(decl.value);
      let changed = false;

      const reportDuration = (node, nearest, fixedValue = null) => {
        const index = declarationValueIndex(decl) + node.sourceIndex;
        const payload = {
          endIndex: index + node.value.length,
          index,
          message: nearest
            ? messages.rejectedDuration(
              node.value,
              formatTime(nearest.lower, 'ms'),
              formatTime(nearest.upper, 'ms'),
            )
            : messages.invalidDuration(node.value),
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

      const reportEasing = (node, replacement = null) => {
        const source = functionToString(node);
        const index = declarationValueIndex(decl) + node.sourceIndex;
        const payload = {
          endIndex: index + source.length,
          index,
          message: messages.rejectedEasing(source),
          node: decl,
          result,
          ruleName,
        };

        if (replacement) {
          payload.fix = () => {
            node.type = 'word';
            node.value = replacement;
            delete node.nodes;
            return true;
          };
        }

        stylelint.utils.report(payload);
      };

      walkRootValueNodes(parsed, (node) => {
        if (node.type === 'function') {
          const functionName = node.value.toLowerCase();
          if (!EASING_PROPERTIES.has(prop) || !EASING_FUNCTIONS.has(functionName)) {
            return false;
          }

          const source = functionToString(node);
          reportEasing(node, options.easingTokenMap[source] || null);
          changed = changed || Boolean(options.easingTokenMap[source]);
          return true;
        }

        if (node.type !== 'word' || !DURATION_PROPERTIES.has(prop)) {
          return false;
        }

        const parsedTime = parseTimeToken(node.value);
        if (!parsedTime) {
          return false;
        }

        if (parsedTime.number < 0) {
          reportDuration(node, null);
          return false;
        }

        if (!options.durationUnits.includes(parsedTime.unit)) {
          return false;
        }

        const msValue = toMs(parsedTime.number, parsedTime.unit);
        if (msValue === null) {
          return false;
        }

        const isOnScale = options.durationScale.some((scaleValue) => numbersEqual(scaleValue, msValue));
        if (isOnScale) {
          return false;
        }

        const nearest = nearestScaleValues(msValue, options.durationScale);
        if (!nearest) {
          return false;
        }

        const fixedValue = options.fixToScale
          ? getFixedNodeValue(parsedTime, nearest.nearest, options)
          : null;

        reportDuration(node, nearest, fixedValue);
        changed = changed || Boolean(fixedValue);
        return false;
      });

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
  url: 'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/use-motion-scale.md',
};

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
module.exports.ruleName = ruleName;
module.exports.messages = messages;
module.exports.meta = ruleFunction.meta;
