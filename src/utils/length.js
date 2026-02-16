'use strict';

const LENGTH_RE = /^(-?(?:\d+|\d*\.\d+))(px|rem|em|%)?$/i;
const EPSILON = 0.0001;

function parseLengthToken(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const value = rawValue.trim();
  const match = value.match(LENGTH_RE);

  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  const unit = (match[2] || '').toLowerCase();

  if (!Number.isFinite(number)) {
    return null;
  }

  return { number, raw: value, unit };
}

function toPx(number, unit, baseFontSize) {
  if (unit === '' || unit === 'px') {
    return number;
  }

  if (unit === 'rem' || unit === 'em') {
    return number * baseFontSize;
  }

  return null;
}

function fromPx(pxValue, unit, baseFontSize) {
  if (unit === '' || unit === 'px') {
    return pxValue;
  }

  if (unit === 'rem' || unit === 'em') {
    return pxValue / baseFontSize;
  }

  return null;
}

function formatNumber(value) {
  if (Math.abs(value) < EPSILON) {
    return '0';
  }

  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded).replace(/\.?0+$/, '');
}

function formatLength(number, unit) {
  if (number === 0) {
    if (unit === 'px') {
      return '0px';
    }

    if (unit === 'rem' || unit === 'em' || unit === '') {
      return '0';
    }
  }

  return `${formatNumber(number)}${unit}`;
}

function numbersEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

function normalizeScale(scale, baseFontSize) {
  const normalized = [];

  for (const entry of scale) {
    if (typeof entry === 'number') {
      normalized.push(entry);
      continue;
    }

    const parsed = parseLengthToken(String(entry));
    if (!parsed) {
      continue;
    }

    const px = toPx(parsed.number, parsed.unit, baseFontSize);
    if (px !== null) {
      normalized.push(px);
    }
  }

  return [...new Set(normalized)].sort((a, b) => a - b);
}

function nearestScaleValues(targetPx, scalePx) {
  if (scalePx.length === 0) {
    return null;
  }

  let lower = scalePx[0];
  let upper = scalePx[scalePx.length - 1];

  for (const value of scalePx) {
    if (value <= targetPx) {
      lower = value;
    }

    if (value >= targetPx) {
      upper = value;
      break;
    }
  }

  const nearest =
    Math.abs(targetPx - lower) <= Math.abs(upper - targetPx) ? lower : upper;

  return {
    lower,
    nearest,
    upper,
  };
}

module.exports = {
  formatLength,
  normalizeScale,
  numbersEqual,
  parseLengthToken,
  toPx,
  fromPx,
  nearestScaleValues,
};
