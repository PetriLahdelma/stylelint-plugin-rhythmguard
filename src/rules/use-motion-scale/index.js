'use strict';

const stylelint = require('stylelint');
const valueParser = require('postcss-value-parser');
const {
  nearestScaleValues,
  nearestText,
  numbersEqual,
} = require('../../core/length');
const {
  declarationValueSource,
  isMathFunction,
  walkRootValueNodes,
  writeDeclarationValue,
} = require('../../core/value-nodes');
const {
  formatTime,
  fromMs,
  normalizeDurationScale,
  normalizeDurationUnits,
  parseTimeToken,
  toMs,
} = require('../../core/time');

const { reportValueNode } = require('../report');
const { validatePrimary } = require('../validate');
const { isNote, normalizeNote, withNote } = require('../../core/options');

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
const SHORTHAND_PROPERTIES = new Set(['transition', 'animation']);

const messages = stylelint.utils.ruleMessages(ruleName, {
  invalidDuration: (value, note = '') =>
    withNote(`Unexpected negative motion duration "${value}". Use non-negative duration values.`, note),
  rejectedDuration: (value, lower, upper, note = '') =>
    withNote(`Unexpected motion duration "${value}". Use duration scale values (${nearestText(lower, upper)}).`, note),
  rejectedEasing: (value, note = '') =>
    withNote(`Unexpected raw motion easing "${value}". Use motion tokens for easing decisions.`, note),
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
    note: normalizeNote(options.note),
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
      note: [isNote],
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

  return formatTime(parsedTime.number < 0 ? -converted : converted, parsedTime.unit);
}

function functionToString(node) {
  return valueParser.stringify(node);
}

/**
 * The time nodes of a transition or animation shorthand that are its
 * durations: the first time of each comma-separated layer (#236). The second
 * is the delay, which may be negative. A function before the first time, such
 * as var() or calc(), may itself be the duration, so that layer has no time
 * known to be a duration and none is returned for it.
 */
function shorthandDurationNodes(parsed) {
  const durations = new Set();
  let settled = false;

  for (const node of parsed.nodes) {
    if (node.type === 'div' && node.value === ',') {
      settled = false;
      continue;
    }

    if (settled) {
      continue;
    }

    if (node.type === 'function') {
      settled = !EASING_FUNCTIONS.has(node.value.toLowerCase());
      continue;
    }

    if (node.type === 'word' && parseTimeToken(node.value)) {
      durations.add(node);
      settled = true;
    }
  }

  return durations;
}

/** Whether a negative time in this place is an error: true for durations, false for delays. */
function createDurationRole(prop, parsed) {
  if (prop.endsWith('-duration')) {
    return () => true;
  }

  if (!SHORTHAND_PROPERTIES.has(prop)) {
    return () => false;
  }

  const durations = shorthandDurationNodes(parsed);
  return (node) => durations.has(node);
}

const ruleFunction = (primary, secondaryOptions) => {
  return (root, result) => {
    if (!validatePrimary(result, ruleName, primary) || !validateSecondaryOptions(result, secondaryOptions)) {
      return;
    }

    const options = buildOptions(secondaryOptions);

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      if (!DURATION_PROPERTIES.has(prop) && !EASING_PROPERTIES.has(prop)) {
        return;
      }

      const source = declarationValueSource(decl);
      const parsed = valueParser(source.parseText);
      const isDuration = createDurationRole(prop, parsed);
      let changed = false;

      const reportDuration = (node, nearest, fixedValue = null) => {
        reportValueNode({
          decl,
          message: nearest
            ? messages.rejectedDuration(
              node.value,
              formatTime(nearest.lower, 'ms'),
              formatTime(nearest.upper, 'ms'),
              options.note,
            )
            : messages.invalidDuration(node.value, options.note),
          node,
          replacement: fixedValue,
          result,
          ruleName,
        });
      };

      const reportEasing = (node, replacement = null) => {
        const source = functionToString(node);
        reportValueNode({
          decl,
          fix: replacement
            ? () => {
              node.type = 'word';
              node.value = replacement;
              delete node.nodes;
              return true;
            }
            : null,
          length: source.length,
          message: messages.rejectedEasing(source, options.note),
          node,
          result,
          ruleName,
        });
      };

      walkRootValueNodes(parsed, (node) => {
        if (node.type === 'function') {
          const functionName = node.value.toLowerCase();
          // A time inside calc(), clamp(), min() or max() is a term of the
          // expression, not a duration on its own (#232).
          if (isMathFunction(functionName)) {
            return true;
          }

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

        // A negative duration is invalid; a negative delay starts the motion
        // partway through, so its size is checked like any other (#236).
        if (parsedTime.number < 0 && isDuration(node)) {
          reportDuration(node, null);
          return false;
        }

        if (!options.durationUnits.includes(parsedTime.unit)) {
          return false;
        }

        const msValue = toMs(Math.abs(parsedTime.number), parsedTime.unit);
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
        writeDeclarationValue(decl, source, parsed);
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
