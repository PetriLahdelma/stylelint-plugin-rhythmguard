'use strict';

const {
  formatLength,
  formatNumber,
  nearestScaleValues,
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('./length');

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];
const DEFAULT_UNITS = ['px', 'rem', 'em'];
// Tailwind's numeric spacing utilities are multiples of one unit: `--spacing`
// (0.25rem, 4px) in v4, and the same 4px step in the v3 default scale.
const DEFAULT_SPACING_UNIT_PX = 4;

const ARBITRARY_SPACING_CLASS = /^(?<utility>-?(?:m(?:[trblxy])?|p(?:[trblxy])?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|translate-[xy]|scroll-(?:m|p)(?:[trblxy])?))-\[(?<rawValue>[^\]]+)\]$/;

function normalizeTailwindClassOptions(option = {}) {
  return {
    allowNegative: option.allowNegative !== false,
    baseFontSize:
      typeof option.baseFontSize === 'number' &&
      Number.isFinite(option.baseFontSize) &&
      option.baseFontSize > 0
        ? option.baseFontSize
        : 16,
    scale: Array.isArray(option.scale) ? option.scale : DEFAULT_SCALE,
    spacingUnit: option.spacingUnit === false
      ? null
      : typeof option.spacingUnit === 'number' && Number.isFinite(option.spacingUnit) && option.spacingUnit > 0
        ? option.spacingUnit
        : DEFAULT_SPACING_UNIT_PX,
    units: Array.isArray(option.units)
      ? option.units.map((unit) => String(unit).toLowerCase())
      : DEFAULT_UNITS,
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

function hasInvalidVariantPrefix(prefix) {
  let bracketDepth = 0;

  for (const character of prefix) {
    if (character === '[') {
      bracketDepth++;
      continue;
    }

    if (character === ']' && bracketDepth > 0) {
      bracketDepth--;
      continue;
    }

    if (bracketDepth === 0 && /["'=<]/.test(character)) {
      return true;
    }
  }

  return false;
}

/**
 * The utility class Tailwind generates for a px value, or null when the value
 * is not a quarter step of the spacing unit (v4 generates any quarter step;
 * v3 generates the quarter steps of its default scale). `p-3` for 12px on a
 * 4px unit; `-m-3` when the class or the value is negative.
 */
function utilityClassFor(utility, px, negative, spacingUnit) {
  if (!spacingUnit) {
    return null;
  }
  const steps = Math.abs(px) / spacingUnit;
  const quarters = steps * 4;
  if (Math.abs(quarters - Math.round(quarters)) > 1e-9) {
    return null;
  }
  const name = utility.startsWith('-') ? utility.slice(1) : utility;
  const sign = negative && steps !== 0 ? '-' : '';
  return `${sign}${name}-${formatNumber(Math.round(quarters) / 4)}`;
}

function analyzeClassToken(token, options, scalePx) {
  const parsedToken = parseClassToken(token);
  if (parsedToken.prefix && hasInvalidVariantPrefix(parsedToken.prefix)) {
    return null;
  }

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
      fixedToken: null,
      nearest: null,
      parsedLength,
      reason: 'negative',
      rawValue: match.groups.rawValue,
      utility: match.groups.utility,
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

  const replacementNumber = parsedLength.unit === 'px'
    ? signedNearest
    : signedNearest / options.baseFontSize;

  const negative = match.groups.utility.startsWith('-') || parsedLength.number < 0;
  const wrap = (candidate) =>
    `${parsedToken.prefix}${parsedToken.leadingImportant}${candidate}${parsedToken.trailingImportant}`;
  const utilityFix = utilityClassFor(match.groups.utility, nearest.nearest, negative, options.spacingUnit);
  const lowerUtility = utilityClassFor(match.groups.utility, nearest.lower, negative, options.spacingUnit);
  const upperUtility = utilityClassFor(match.groups.utility, nearest.upper, negative, options.spacingUnit);

  const replacementValue = formatLength(replacementNumber, parsedLength.unit);
  const fixedCandidate = utilityFix || parsedToken.candidate.replace(match.groups.rawValue, replacementValue);

  return {
    fixedToken: wrap(fixedCandidate),
    nearest,
    // The utility classes for the two nearest steps, when both are quarter
    // steps of the spacing unit; messages name these instead of px values.
    nearestUtilities: lowerUtility && upperUtility ? { lower: lowerUtility, upper: upperUtility } : null,
    parsedLength,
    reason: 'off-scale',
    rawValue: match.groups.rawValue,
    utility: match.groups.utility,
  };
}

function createTailwindClassAnalyzer(option = {}) {
  const options = normalizeTailwindClassOptions(option);
  const scalePx = normalizeScale(options.scale, options.baseFontSize);

  return {
    analyzeClassString(value) {
      const findings = [];

      for (const segment of findClassSegments(value)) {
        const analysis = analyzeClassToken(segment.token, options, scalePx);
        if (analysis) {
          findings.push({ analysis, segment });
        }
      }

      return findings;
    },
    analyzeToken(token) {
      return analyzeClassToken(token, options, scalePx);
    },
    options,
    scalePx,
  };
}

/**
 * The message text for an off-scale class: the two nearest utility classes
 * with their px values when the unit makes them, the px steps otherwise.
 */
function offScaleClassMessage(token, analysis) {
  if (analysis.reason === 'negative') {
    return `Unexpected Tailwind arbitrary spacing value "${token}". Negative values are disabled for this rule.`;
  }
  const lowerPx = analysis.nearest ? formatLength(analysis.nearest.lower, 'px') : 'n/a';
  const upperPx = analysis.nearest ? formatLength(analysis.nearest.upper, 'px') : 'n/a';
  if (analysis.nearestUtilities) {
    const { lower, upper } = analysis.nearestUtilities;
    return `Unexpected Tailwind arbitrary spacing value "${token}". Use "${lower}" (${lowerPx}) or "${upper}" (${upperPx}).`;
  }
  return `Unexpected Tailwind arbitrary spacing value "${token}". Use scale values (nearest: ${lowerPx} or ${upperPx}).`;
}

module.exports = {
  createTailwindClassAnalyzer,
  findClassSegments,
  normalizeTailwindClassOptions,
  offScaleClassMessage,
};
