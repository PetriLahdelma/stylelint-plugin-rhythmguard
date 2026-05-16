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

function findLastVariantSeparator(token) {
  let bracketDepth = 0;
  let separatorIndex = -1;

  for (let index = 0; index < token.length; index++) {
    const character = token[index];

    if (character === '[') {
      bracketDepth++;
      continue;
    }

    if (character === ']' && bracketDepth > 0) {
      bracketDepth--;
      continue;
    }

    if (character === ':' && bracketDepth === 0) {
      separatorIndex = index;
    }
  }

  return separatorIndex;
}

function parseClassToken(token) {
  const separatorIndex = findLastVariantSeparator(token);
  const prefix = separatorIndex === -1
    ? ''
    : token.slice(0, separatorIndex + 1);
  let candidate = separatorIndex === -1
    ? token
    : token.slice(separatorIndex + 1);
  let leadingImportant = '';
  let trailingImportant = '';

  if (candidate.startsWith('!')) {
    leadingImportant = '!';
    candidate = candidate.slice(1);
  }

  if (candidate.endsWith('!')) {
    trailingImportant = '!';
    candidate = candidate.slice(0, -1);
  }

  return {
    candidate,
    leadingImportant,
    prefix,
    trailingImportant,
  };
}

function analyzeToken(token, options, scalePx) {
  const parsedToken = parseClassToken(token);
  const match = parsedToken.candidate.match(ARBITRARY_SPACING_CLASS);
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
  const fixedCandidate = parsedToken.candidate.replace(match.groups.rawValue, replacementValue);
  const fixedToken = `${parsedToken.prefix}${parsedToken.leadingImportant}${fixedCandidate}${parsedToken.trailingImportant}`;

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

  const findings = [];
  let fixedValue = value;
  let fixedValueOffset = 0;

  for (const segment of segments) {
    const analysis = analyzeToken(segment.token, options, scalePx);
    if (!analysis) {
      continue;
    }

    findings.push({ analysis, segment });

    if (allowFix && analysis.reason !== 'negative' && node.type === 'Literal') {
      const replacementStart = segment.start + fixedValueOffset;
      fixedValue = `${fixedValue.slice(0, replacementStart)}${analysis.fixedToken}${fixedValue.slice(replacementStart + segment.token.length)}`;
      fixedValueOffset += analysis.fixedToken.length - segment.token.length;
    }
  }

  if (findings.length === 0) {
    return;
  }

  const fixedText = allowFix && node.type === 'Literal' && fixedValue !== value
    ? `${quote}${fixedValue.replace(new RegExp(quote, 'g'), `\\${quote}`)}${quote}`
    : null;

  for (const { analysis, segment } of findings) {
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
        fixedText && analysis.reason !== 'negative'
          ? (fixer) => fixer.replaceText(node, fixedText)
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
