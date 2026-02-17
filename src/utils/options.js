'use strict';

const stylelint = require('stylelint');
const {
  DEFAULT_IGNORE_KEYWORDS,
  SPACING_PROPERTY_PATTERNS,
} = require('./constants');
const { parseLengthToken } = require('./length');
const {
  getScalePreset,
  listScalePresetNames,
  resolveScaleSelection,
} = require('../presets/scales');

const DEFAULT_SCALE = getScalePreset('rhythmic-4') || [0, 4, 8, 12, 16, 24, 32];
const VALID_UNITS = new Set(['px', 'rem', 'em']);
const VALIDATE_ALWAYS = () => true;

let knownCssProperties = [];
try {
  const knownCssPropertiesPackage = require('known-css-properties');
  if (Array.isArray(knownCssPropertiesPackage.all)) {
    knownCssProperties = knownCssPropertiesPackage.all;
  }
} catch {
  knownCssProperties = [];
}

const hasKnownCssProperties = knownCssProperties.length > 0;
const supportedSpacingProperties = new Set(
  knownCssProperties.filter((property) =>
    SPACING_PROPERTY_PATTERNS.some((pattern) => pattern.test(property)),
  ),
);
supportedSpacingProperties.add('translate-x');
supportedSpacingProperties.add('translate-y');
supportedSpacingProperties.add('translate-z');

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSupportedUnit(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return VALID_UNITS.has(value.trim().toLowerCase());
}

function isScaleEntry(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0;
  }

  if (!isNonEmptyString(value)) {
    return false;
  }

  const parsed = parseLengthToken(value);
  if (!parsed || parsed.number < 0) {
    return false;
  }

  return parsed.unit === '' || VALID_UNITS.has(parsed.unit);
}

function isPropertyPatternEntry(value) {
  if (value instanceof RegExp) {
    return true;
  }

  if (!isNonEmptyString(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (!hasKnownCssProperties) {
    return SPACING_PROPERTY_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  return supportedSpacingProperties.has(normalized);
}

function isTokenMap(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((tokenValue) => isNonEmptyString(tokenValue));
}

function validateSecondaryOptionShapes(result, ruleName, secondaryOptions, schema) {
  if (secondaryOptions === undefined || secondaryOptions === null) {
    return true;
  }

  if (!isPlainObject(secondaryOptions)) {
    return true;
  }

  let valid = true;

  for (const [optionName, descriptor] of Object.entries(schema)) {
    const optionValue = secondaryOptions[optionName];
    if (optionValue === undefined) {
      continue;
    }

    if (descriptor.expectsArray && !Array.isArray(optionValue)) {
      valid = false;
      result.warn(
        `Invalid value ${stringifyOptionValue(optionValue)} for option "${optionName}" of rule "${ruleName}"`,
        { stylelintType: 'invalidOption' },
      );
      result.stylelint.stylelintError = true;
      continue;
    }

    if (descriptor.expectsObject && !isPlainObject(optionValue)) {
      valid = false;
      result.warn(
        `Invalid value ${stringifyOptionValue(optionValue)} for option "${optionName}" of rule "${ruleName}"`,
        { stylelintType: 'invalidOption' },
      );
      result.stylelint.stylelintError = true;
    }
  }

  return valid;
}

function stringifyOptionValue(value) {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  return `"${JSON.stringify(value)}"`;
}

function buildPossibleOptionMap(schema) {
  return Object.fromEntries(
    Object.entries(schema).map(([optionName, descriptor]) => [
      optionName,
      [descriptor.entryValidator || VALIDATE_ALWAYS],
    ]),
  );
}

function validateSecondaryOptions({
  result,
  ruleName,
  secondaryOptions,
  schema,
  possibleOptionMap,
}) {
  const validOptions = stylelint.utils.validateOptions(result, ruleName, {
    actual: secondaryOptions,
    optional: true,
    possible: possibleOptionMap,
  });
  const validShapes = validateSecondaryOptionShapes(
    result,
    ruleName,
    secondaryOptions,
    schema,
  );

  return validOptions && validShapes;
}

const SCALE_VALIDATION_SCHEMA = Object.freeze({
  allowNegative: Object.freeze({
    entryValidator: isBoolean,
  }),
  allowPercentages: Object.freeze({
    entryValidator: isBoolean,
  }),
  baseFontSize: Object.freeze({
    entryValidator: isFinitePositiveNumber,
  }),
  customScale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  enforceInsideMathFunctions: Object.freeze({
    entryValidator: isBoolean,
  }),
  fixToScale: Object.freeze({
    entryValidator: isBoolean,
  }),
  preset: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  scale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  units: Object.freeze({
    entryValidator: isSupportedUnit,
    expectsArray: true,
  }),
});

const USE_SCALE_VALIDATION_SCHEMA = Object.freeze({
  ...SCALE_VALIDATION_SCHEMA,
  ignoreValues: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  properties: Object.freeze({
    entryValidator: isPropertyPatternEntry,
    expectsArray: true,
  }),
  tokenFunctions: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  tokenPattern: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
});

const NO_OFFSCALE_TRANSFORM_VALIDATION_SCHEMA = Object.freeze({
  ...SCALE_VALIDATION_SCHEMA,
});

const PREFER_TOKEN_VALIDATION_SCHEMA = Object.freeze({
  allowNumericScale: Object.freeze({
    entryValidator: isBoolean,
  }),
  baseFontSize: Object.freeze({
    entryValidator: isFinitePositiveNumber,
  }),
  customScale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  enforceInsideMathFunctions: Object.freeze({
    entryValidator: isBoolean,
  }),
  ignoreValues: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  preset: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  properties: Object.freeze({
    entryValidator: isPropertyPatternEntry,
    expectsArray: true,
  }),
  scale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  tokenFunctions: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  tokenMap: Object.freeze({
    entryValidator: isTokenMap,
    expectsObject: true,
  }),
  tokenPattern: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
});

const USE_SCALE_POSSIBLE_OPTIONS = Object.freeze(
  buildPossibleOptionMap(USE_SCALE_VALIDATION_SCHEMA),
);
const NO_OFFSCALE_TRANSFORM_POSSIBLE_OPTIONS = Object.freeze(
  buildPossibleOptionMap(NO_OFFSCALE_TRANSFORM_VALIDATION_SCHEMA),
);
const PREFER_TOKEN_POSSIBLE_OPTIONS = Object.freeze(
  buildPossibleOptionMap(PREFER_TOKEN_VALIDATION_SCHEMA),
);

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
    enforceInsideMathFunctions: options.enforceInsideMathFunctions === true,
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

function validateUseScaleSecondaryOptions(result, ruleName, secondaryOptions) {
  return validateSecondaryOptions({
    result,
    ruleName,
    secondaryOptions,
    schema: USE_SCALE_VALIDATION_SCHEMA,
    possibleOptionMap: USE_SCALE_POSSIBLE_OPTIONS,
  });
}

function validateNoOffscaleTransformSecondaryOptions(result, ruleName, secondaryOptions) {
  return validateSecondaryOptions({
    result,
    ruleName,
    secondaryOptions,
    schema: NO_OFFSCALE_TRANSFORM_VALIDATION_SCHEMA,
    possibleOptionMap: NO_OFFSCALE_TRANSFORM_POSSIBLE_OPTIONS,
  });
}

function validatePreferTokenSecondaryOptions(result, ruleName, secondaryOptions) {
  return validateSecondaryOptions({
    result,
    ruleName,
    secondaryOptions,
    schema: PREFER_TOKEN_VALIDATION_SCHEMA,
    possibleOptionMap: PREFER_TOKEN_POSSIBLE_OPTIONS,
  });
}

module.exports = {
  buildScaleOptions,
  buildTokenOptions,
  validateNoOffscaleTransformSecondaryOptions,
  validatePreferTokenSecondaryOptions,
  validateUseScaleSecondaryOptions,
};
