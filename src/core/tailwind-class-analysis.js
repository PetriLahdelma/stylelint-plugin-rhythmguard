'use strict';

const {
  formatLength,
  formatNumber,
  isHairlineLength,
  nearestScaleValues,
  nearestText,
  normalizeScale,
  parseLengthToken,
  pxOnScale,
  toPx,
} = require('./length');

// The ESLint rule's and the audit's default scale. It is not the `rhythmic-4`
// preset (which continues to 40, 48, 64); unifying the defaults changes
// reports, so it waits for a major (#246).
const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];
const DEFAULT_UNITS = ['px', 'rem', 'em'];
// Tailwind's numeric spacing utilities are multiples of one unit: `--spacing`
// (0.25rem) in v4, and the same 0.25rem step in the v3 default scale. In px
// that is a quarter of the root font size: 4px at 16px, 2.5px at 10px (#247).
const SPACING_UNIT_REM = 0.25;

const ARBITRARY_SPACING_CLASS = /^(?<utility>-?(?:m(?:[trblxy])?|p(?:[trblxy])?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|translate-[xy]|scroll-(?:m|p)(?:[trblxy])?))-\[(?<rawValue>[^\]]+)\]$/;

function normalizeTailwindClassOptions(option = {}) {
  const baseFontSize =
    typeof option.baseFontSize === 'number' &&
    Number.isFinite(option.baseFontSize) &&
    option.baseFontSize > 0
      ? option.baseFontSize
      : 16;
  return {
    allowHairlines: option.allowHairlines !== false,
    allowNegative: option.allowNegative !== false,
    baseFontSize,
    scale: Array.isArray(option.scale) ? option.scale : DEFAULT_SCALE,
    spacingUnit: option.spacingUnit === false
      ? null
      : typeof option.spacingUnit === 'number' && Number.isFinite(option.spacingUnit) && option.spacingUnit > 0
        ? option.spacingUnit
        : baseFontSize * SPACING_UNIT_REM,
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

  // The same exemption as use-scale, and in the same order: a hairline is not
  // reported, not even as a negative value (#159).
  if (options.allowHairlines && isHairlineLength(parsedLength, options.baseFontSize)) {
    return null;
  }

  // `-m-[16px]` and `m-[-16px]` are both negative margins (#241); in
  // `-m-[-16px]` the two signs cancel and Tailwind writes a positive margin (#277).
  const negative = match.groups.utility.startsWith('-') !== parsedLength.number < 0;

  if (!options.allowNegative && negative) {
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

  const isOnScale = pxOnScale(scalePx, pxValue, parsedLength.unit, options.baseFontSize);
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

  const wrap = (candidate) =>
    `${parsedToken.prefix}${parsedToken.leadingImportant}${candidate}${parsedToken.trailingImportant}`;
  // Utility classes are root-relative; an `em` value follows the element's own
  // font size, so it keeps the arbitrary form and its unit (#247).
  const spacingUnit = parsedLength.unit === 'em' ? null : options.spacingUnit;
  const utilityFix = utilityClassFor(match.groups.utility, nearest.nearest, negative, spacingUnit);
  const lowerUtility = utilityClassFor(match.groups.utility, nearest.lower, negative, spacingUnit);
  const upperUtility = utilityClassFor(match.groups.utility, nearest.upper, negative, spacingUnit);

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
    return lower === upper
      ? `Unexpected Tailwind arbitrary spacing value "${token}". Use "${lower}" (${lowerPx}).`
      : `Unexpected Tailwind arbitrary spacing value "${token}". Use "${lower}" (${lowerPx}) or "${upper}" (${upperPx}).`;
  }
  return `Unexpected Tailwind arbitrary spacing value "${token}". Use scale values (${nearestText(lowerPx, upperPx)}).`;
}

module.exports = {
  createTailwindClassAnalyzer,
  findClassSegments,
  normalizeTailwindClassOptions,
  offScaleClassMessage,
};
