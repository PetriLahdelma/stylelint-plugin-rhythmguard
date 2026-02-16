'use strict';

const {
  DEFAULT_IGNORE_KEYWORDS,
  SPACING_PROPERTY_PATTERNS,
} = require('./constants');
const {
  getScalePreset,
  listScalePresetNames,
  resolveScaleSelection,
} = require('../presets/scales');

const DEFAULT_SCALE = getScalePreset('rhythmic-4') || [0, 4, 8, 12, 16, 24, 32];

function buildScaleOptions(rawOptions) {
  const options = rawOptions || {};
  const scaleSelection = resolveScaleSelection(options, DEFAULT_SCALE);

  return {
    allowNegative: options.allowNegative !== false,
    allowPercentages: options.allowPercentages !== false,
    baseFontSize:
      typeof options.baseFontSize === 'number' &&
      Number.isFinite(options.baseFontSize) &&
      options.baseFontSize > 0
        ? options.baseFontSize
        : 16,
    enforceInsideMathFunctions: options.enforceInsideMathFunctions === true,
    fixToScale: options.fixToScale !== false,
    ignoreValues: Array.isArray(options.ignoreValues)
      ? options.ignoreValues.map((value) => String(value).toLowerCase())
      : DEFAULT_IGNORE_KEYWORDS,
    invalidPreset: scaleSelection.invalidPreset,
    preset: scaleSelection.selectedPreset,
    presetNames: listScalePresetNames(),
    properties: Array.isArray(options.properties)
      ? options.properties
      : SPACING_PROPERTY_PATTERNS,
    scale: scaleSelection.scale,
    tokenFunctions: Array.isArray(options.tokenFunctions)
      ? options.tokenFunctions.map((value) => String(value).toLowerCase())
      : ['var', 'theme', 'token'],
    tokenPattern:
      typeof options.tokenPattern === 'string' && options.tokenPattern.length > 0
        ? options.tokenPattern
        : '^--space-',
    units: Array.isArray(options.units)
      ? options.units.map((unit) => String(unit).toLowerCase())
      : ['px', 'rem', 'em'],
  };
}

function buildTokenOptions(rawOptions) {
  const options = rawOptions || {};
  const scaleSelection = resolveScaleSelection(options, DEFAULT_SCALE);

  return {
    allowNumericScale: options.allowNumericScale === true,
    baseFontSize:
      typeof options.baseFontSize === 'number' &&
      Number.isFinite(options.baseFontSize) &&
      options.baseFontSize > 0
        ? options.baseFontSize
        : 16,
    ignoreValues: Array.isArray(options.ignoreValues)
      ? options.ignoreValues.map((value) => String(value).toLowerCase())
      : DEFAULT_IGNORE_KEYWORDS,
    invalidPreset: scaleSelection.invalidPreset,
    preset: scaleSelection.selectedPreset,
    presetNames: listScalePresetNames(),
    properties: Array.isArray(options.properties)
      ? options.properties
      : SPACING_PROPERTY_PATTERNS,
    scale: scaleSelection.scale,
    tokenFunctions: Array.isArray(options.tokenFunctions)
      ? options.tokenFunctions.map((value) => String(value).toLowerCase())
      : ['var', 'theme', 'token'],
    tokenMap:
      options.tokenMap && typeof options.tokenMap === 'object'
        ? options.tokenMap
        : {},
    tokenPattern:
      typeof options.tokenPattern === 'string' && options.tokenPattern.length > 0
        ? options.tokenPattern
        : '^--space-',
  };
}

module.exports = {
  buildScaleOptions,
  buildTokenOptions,
};
