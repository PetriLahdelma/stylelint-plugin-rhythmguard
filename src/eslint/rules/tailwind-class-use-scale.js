'use strict';

const {
  formatLength,
  nearestScaleValues,
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('../../utils/length');

const RULE_NAME = 'tailwind-class-use-scale';

const ARBITRARY_SPACING_CLASS = /^(?<utility>-?(?:m(?:[trblxy])?|p(?:[trblxy])?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|translate-[xy]|scroll-(?:m|p)(?:[trblxy])?))-\[(?<rawValue>[^\]]+)\]$/;

function getOptions(context) {
  const option = context.options && context.options[0] ? context.options[0] : {};

  return {
    allowNegative: option.allowNegative !== false,
    baseFontSize:
      typeof option.baseFontSize === 'number' &&
      Number.isFinite(option.baseFontSize) &&
      option.baseFontSize > 0
        ? option.baseFontSize
        : 16,
    scale: Array.isArray(option.scale)
      ? option.scale
      : [0, 4, 8, 12, 16, 24, 32],
    units: Array.isArray(option.units)
      ? option.units.map((unit) => String(unit).toLowerCase())
      : ['px', 'rem', 'em'],
  };
}

function findClassSegments(value) {
  const segments = [];
  const tokenRegex = /\S+/g;
  let match;

  while ((match = tokenRegex.exec(value)) !== null) {
    segments.push({
      start: match.index,
      token: match[0],
    });
  }

  return segments;
}

function analyzeToken(token, options, scalePx) {
  const match = token.match(ARBITRARY_SPACING_CLASS);
  if (!match || !match.groups) {
    return null;
  }

  const parsedLength = parseLengthToken(match.groups.rawValue);
  if (!parsedLength || parsedLength.number === 0 || parsedLength.unit === '') {
    return null;
  }

  if (!options.allowNegative && parsedLength.number < 0) {
    return {
      nearest: null,
      parsedLength,
      reason: 'negative',
    };
  }

  if (!options.units.includes(parsedLength.unit)) {
    return null;
  }

  const pxValue = toPx(Math.abs(parsedLength.number), parsedLength.unit, options.baseFontSize);
  if (pxValue === null) {
    return null;
  }

  const isOnScale = scalePx.some((entry) => numbersEqual(entry, pxValue));
  if (isOnScale) {
    return null;
  }

  const nearest = nearestScaleValues(pxValue, scalePx);
  if (!nearest) {
    return null;
  }

  const signedNearest = parsedLength.number < 0
    ? -Math.abs(nearest.nearest)
    : nearest.nearest;

  const replacementValuePx = signedNearest;
  const replacementNumber = parsedLength.unit === 'px'
    ? replacementValuePx
    : replacementValuePx / options.baseFontSize;

  const replacementValue = formatLength(replacementNumber, parsedLength.unit);
  const fixedToken = token.replace(match.groups.rawValue, replacementValue);

  return {
    fixedToken,
    nearest,
    parsedLength,
    reason: 'off-scale',
  };
}

function maybeCheckNodeText(node, sourceCode, context, options, scalePx, allowFix) {
  const rawText = sourceCode.getText(node);
  let value = null;
  let quote = null;

  if (node.type === 'Literal' && typeof node.value === 'string') {
    value = node.value;
    quote = rawText[0] === '"' || rawText[0] === "'" ? rawText[0] : '"';
  }

  if (node.type === 'TemplateElement') {
    value = node.value.raw;
  }

  if (!value || typeof value !== 'string') {
    return;
  }

  const segments = findClassSegments(value);
  if (segments.length === 0) {
    return;
  }
  for (const segment of segments) {
    const analysis = analyzeToken(segment.token, options, scalePx);
    if (!analysis) {
      continue;
    }

    const lower = analysis.nearest
      ? formatLength(analysis.nearest.lower, 'px')
      : 'n/a';
    const upper = analysis.nearest
      ? formatLength(analysis.nearest.upper, 'px')
      : 'n/a';
    context.report({
      message:
        analysis.reason === 'negative'
          ? `Unexpected Tailwind arbitrary spacing value "${segment.token}". Negative values are disabled for this rule.`
          : `Unexpected Tailwind arbitrary spacing value "${segment.token}". Use scale values (nearest: ${lower} or ${upper}).`,
      node,
      fix:
        allowFix && analysis.reason !== 'negative' && node.type === 'Literal'
          ? (fixer) => {
            const nextValue = `${value.slice(0, segment.start)}${analysis.fixedToken}${value.slice(segment.start + segment.token.length)}`;
            const escaped = nextValue.replace(new RegExp(quote, 'g'), `\\${quote}`);
            return fixer.replaceText(node, `${quote}${escaped}${quote}`);
          }
          : null,
    });
  }
}

module.exports = {
  meta: {
    docs: {
      description: 'Enforce spacing scale for Tailwind arbitrary spacing utilities in class strings',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowNegative: { type: 'boolean' },
          baseFontSize: { type: 'number' },
          scale: {
            items: {
              anyOf: [
                { type: 'number' },
                { type: 'string' },
              ],
            },
            type: 'array',
          },
          units: {
            items: { type: 'string' },
            type: 'array',
          },
        },
        type: 'object',
      },
    ],
  },
  create(context) {
    const options = getOptions(context);
    const scalePx = normalizeScale(options.scale, options.baseFontSize);
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      Literal(node) {
        maybeCheckNodeText(node, sourceCode, context, options, scalePx, true);
      },
      TemplateElement(node) {
        maybeCheckNodeText(node, sourceCode, context, options, scalePx, false);
      },
    };
  },
  ruleName: RULE_NAME,
};
