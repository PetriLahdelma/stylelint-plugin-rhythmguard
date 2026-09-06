'use strict';

const {
  formatLength,
  nearestScaleValues,
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
} = require('./length');

const DEFAULT_SCALE = [0, 4, 8, 12, 16, 24, 32];
const DEFAULT_UNITS = ['px', 'rem', 'em'];

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

  const replacementValue = formatLength(replacementNumber, parsedLength.unit);
  const fixedCandidate = parsedToken.candidate.replace(match.groups.rawValue, replacementValue);
  const fixedToken = `${parsedToken.prefix}${parsedToken.leadingImportant}${fixedCandidate}${parsedToken.trailingImportant}`;

  return {
    fixedToken,
    nearest,
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

module.exports = {
  createTailwindClassAnalyzer,
  findClassSegments,
  normalizeTailwindClassOptions,
};
