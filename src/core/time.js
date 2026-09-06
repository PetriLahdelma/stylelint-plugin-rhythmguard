'use strict';

const TIME_RE = /^(-?(?:\d+|\d*\.\d+))(ms|s)$/i;

function parseTimeToken(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(TIME_RE);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isFinite(number)) {
    return null;
  }

  return {
    number,
    unit: match[2].toLowerCase(),
  };
}

function toMs(number, unit) {
  if (unit === 'ms') {
    return number;
  }

  if (unit === 's') {
    return number * 1000;
  }

  return null;
}

function fromMs(ms, unit) {
  if (unit === 'ms') {
    return ms;
  }

  if (unit === 's') {
    return ms / 1000;
  }

  return null;
}

function formatTime(number, unit) {
  const normalized = Object.is(number, -0) ? 0 : number;
  if (Number.isInteger(normalized)) {
    return `${normalized}${unit}`;
  }

  return `${Number(normalized.toFixed(4)).toString()}${unit}`;
}

function normalizeDurationScale(scale) {
  const source = Array.isArray(scale) && scale.length > 0
    ? scale
    : [0, 75, 100, 150, 200, 300, 500, 700, 1000];

  return [...new Set(source
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry >= 0))]
    .sort((a, b) => a - b);
}

function normalizeDurationUnits(units) {
  const source = Array.isArray(units) && units.length > 0
    ? units
    : ['ms', 's'];

  const normalized = source
    .map((unit) => String(unit).trim().toLowerCase())
    .filter((unit) => unit === 'ms' || unit === 's');

  return normalized.length > 0 ? [...new Set(normalized)] : ['ms', 's'];
}

module.exports = {
  formatTime,
  fromMs,
  normalizeDurationScale,
  normalizeDurationUnits,
  parseTimeToken,
  toMs,
};
