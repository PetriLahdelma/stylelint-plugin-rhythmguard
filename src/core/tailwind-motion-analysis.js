'use strict';

const {
  nearestScaleValues,
  numbersEqual,
} = require('./length');
const {
  formatTime,
  fromMs,
  normalizeDurationScale,
  normalizeDurationUnits,
  parseTimeToken,
  toMs,
} = require('./time');
const { findClassSegments } = require('./tailwind-class-analysis');

const ARBITRARY_MOTION_CLASS = /^(?<utility>duration|delay|ease)-\[(?<rawValue>[^\]]+)\]$/;

function normalizeTailwindMotionOptions(option = {}) {
  return {
    durationScale: normalizeDurationScale(option.durationScale),
    durationUnits: normalizeDurationUnits(option.durationUnits),
  };
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

function analyzeMotionToken(token, options) {
  const parsedToken = parseClassToken(token);
  const match = parsedToken.candidate.match(ARBITRARY_MOTION_CLASS);
  if (!match || !match.groups) {
    return null;
  }

  if (match.groups.utility === 'ease') {
    return {
      fixedToken: null,
      rawValue: match.groups.rawValue,
      reason: 'easing',
      utility: match.groups.utility,
    };
  }

  const parsedTime = parseTimeToken(match.groups.rawValue);
  if (!parsedTime) {
    return null;
  }

  if (parsedTime.number < 0) {
    return {
      fixedToken: null,
      nearest: null,
      rawValue: match.groups.rawValue,
      reason: 'negative',
      utility: match.groups.utility,
    };
  }

  if (!options.durationUnits.includes(parsedTime.unit)) {
    return null;
  }

  const msValue = toMs(parsedTime.number, parsedTime.unit);
  if (msValue === null) {
    return null;
  }

  const isOnScale = options.durationScale.some((entry) => numbersEqual(entry, msValue));
  if (isOnScale) {
    return null;
  }

  const nearest = nearestScaleValues(msValue, options.durationScale);
  if (!nearest) {
    return null;
  }

  const converted = fromMs(nearest.nearest, parsedTime.unit);
  if (converted === null) {
    return null;
  }

  const replacementValue = formatTime(converted, parsedTime.unit);
  const fixedCandidate = parsedToken.candidate.replace(match.groups.rawValue, replacementValue);
  const fixedToken = `${parsedToken.prefix}${parsedToken.leadingImportant}${fixedCandidate}${parsedToken.trailingImportant}`;

  return {
    fixedToken,
    nearest,
    rawValue: match.groups.rawValue,
    reason: 'duration',
    utility: match.groups.utility,
  };
}

function createTailwindMotionAnalyzer(option = {}) {
  const options = normalizeTailwindMotionOptions(option);

  return {
    analyzeClassString(value) {
      const findings = [];

      for (const segment of findClassSegments(value)) {
        const analysis = analyzeMotionToken(segment.token, options);
        if (analysis) {
          findings.push({ analysis, segment });
        }
      }

      return findings;
    },
    analyzeToken(token) {
      return analyzeMotionToken(token, options);
    },
    options,
  };
}

module.exports = {
  createTailwindMotionAnalyzer,
  normalizeTailwindMotionOptions,
};
