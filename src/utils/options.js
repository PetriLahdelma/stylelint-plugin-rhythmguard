'use strict';

const stylelint = require('stylelint');
const { all: knownCssProperties = [] } = require('known-css-properties');
const {
  DEFAULT_IGNORE_KEYWORDS,
  DEFAULT_PROPERTY_GROUPS,
  MATH_FUNCTIONS,
  PROPERTY_GROUP_NAMES,
  PROPERTY_GROUP_PATTERNS,
  SPACING_PROPERTY_PATTERNS,
  SUPPORTED_SCALE_UNITS,
} = require('./constants');
const { parseLengthToken } = require('./length');
const {
  getScalePreset,
  listScalePresetNames,
  resolveScaleSelection,
} = require('../presets/scales');

const DEFAULT_SCALE = getScalePreset('rhythmic-4') || [0, 4, 8, 12, 16, 24, 32];
const VALIDATE_ALWAYS = () => true;
const SUPPORTED_MATH_FUNCTIONS = new Set(Array.from(MATH_FUNCTIONS));

const allPropertyPatterns = Object.values(PROPERTY_GROUP_PATTERNS).flat();

const supportedScaleProperties = new Set(
  knownCssProperties.filter((property) =>
    allPropertyPatterns.some((pattern) => pattern.test(property)),
  ),
);
supportedScaleProperties.add('translate-x');
supportedScaleProperties.add('translate-y');
supportedScaleProperties.add('translate-z');

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

  return SUPPORTED_SCALE_UNITS.has(value.trim().toLowerCase());
}

function isUnitStrategy(value) {
  return value === 'convert' || value === 'exact';
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

  return parsed.unit === '' || SUPPORTED_SCALE_UNITS.has(parsed.unit);
}

function parseRegexLikeString(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }

  if (value[0] !== '/' || value.lastIndexOf('/') <= 0) {
    return null;
  }

  const lastSlash = value.lastIndexOf('/');
  const pattern = value.slice(1, lastSlash);
  const flags = value.slice(lastSlash + 1);

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function toStableRegex(regex) {
  if (!(regex instanceof RegExp)) {
    return null;
  }

  if (!regex.global && !regex.sticky) {
    return regex;
  }

  const stableFlags = regex.flags.replace(/[gy]/g, '');
  return new RegExp(regex.source, stableFlags);
}

function isPropertyPatternEntry(value) {
  if (value instanceof RegExp) {
    return true;
  }

  if (!isNonEmptyString(value)) {
    return false;
  }

  const regex = parseRegexLikeString(value.trim());
  if (regex) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return supportedScaleProperties.has(normalized);
}

function isTokenMap(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((tokenValue) => isNonEmptyString(tokenValue));
}

function isPropertyGroupName(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return PROPERTY_GROUP_NAMES.includes(value.trim().toLowerCase());
}

function isMathFunctionArgumentList(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item > 0);
}

function isMathFunctionArgumentMap(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).every(([fn, args]) => {
    if (!isNonEmptyString(fn)) {
      return false;
    }

    if (!SUPPORTED_MATH_FUNCTIONS.has(fn.trim().toLowerCase())) {
      return false;
    }

    return isMathFunctionArgumentList(args);
  });
}

function isScaleOverrideEntry(value) {
  if (Array.isArray(value)) {
    return value.every((entry) => isScaleEntry(entry));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  const hasPreset = value.preset !== undefined;
  const hasScale = value.scale !== undefined;
  const hasCustomScale = value.customScale !== undefined;

  if (!hasPreset && !hasScale && !hasCustomScale) {
    return false;
  }

  if (hasPreset && !isNonEmptyString(value.preset)) {
    return false;
  }

  if (hasScale && (!Array.isArray(value.scale) || !value.scale.every((entry) => isScaleEntry(entry)))) {
    return false;
  }

  if (
    hasCustomScale &&
    (!Array.isArray(value.customScale) || !value.customScale.every((entry) => isScaleEntry(entry)))
  ) {
    return false;
  }

  return true;
}

function isPropertyScaleMap(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).every(([property, scaleOverride]) => {
    if (!isPropertyPatternEntry(property)) {
      return false;
    }

    return isScaleOverrideEntry(scaleOverride);
  });
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

function normalizePropertyGroups(rawGroups) {
  const source = Array.isArray(rawGroups) && rawGroups.length > 0
    ? rawGroups
    : DEFAULT_PROPERTY_GROUPS;

  const normalized = source
    .map((group) => String(group).trim().toLowerCase())
    .filter((group) => PROPERTY_GROUP_NAMES.includes(group));

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_PROPERTY_GROUPS];
}

function resolvePropertyPatterns(options) {
  if (Array.isArray(options.properties)) {
    return options.properties
      .map((entry) => compilePropertyMatcher(entry))
      .filter((entry) => entry !== null);
  }

  const groups = normalizePropertyGroups(options.propertyGroups);
  const patterns = [];

  for (const group of groups) {
    patterns.push(...PROPERTY_GROUP_PATTERNS[group]);
  }

  return patterns.length > 0 ? patterns : SPACING_PROPERTY_PATTERNS;
}

function compilePropertyMatcher(entry) {
  if (entry instanceof RegExp) {
    return toStableRegex(entry);
  }

  if (!isNonEmptyString(entry)) {
    return null;
  }

  const trimmed = entry.trim();
  const parsedRegex = parseRegexLikeString(trimmed);
  if (parsedRegex) {
    return toStableRegex(parsedRegex);
  }

  return trimmed.toLowerCase();
}

function resolveScaleOverride(override) {
  if (Array.isArray(override)) {
    return override;
  }

  if (!isPlainObject(override)) {
    return null;
  }

  return resolveScaleSelection(override, DEFAULT_SCALE).scale;
}

function buildPropertyScaleOverrides(propertyScales) {
  if (!isPlainObject(propertyScales)) {
    return [];
  }

  const overrides = [];

  for (const [entry, scaleOverride] of Object.entries(propertyScales)) {
    const matcher = compilePropertyMatcher(entry);
    const scale = resolveScaleOverride(scaleOverride);
    if (!matcher || !Array.isArray(scale)) {
      continue;
    }

    overrides.push({
      matcher,
      scale,
    });
  }

  return overrides;
}

function normalizeMathFunctionArgumentMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([fn, args]) => {
      const normalizedFn = String(fn).trim().toLowerCase();
      if (!SUPPORTED_MATH_FUNCTIONS.has(normalizedFn) || !isMathFunctionArgumentList(args)) {
        return [];
      }

      return [
        [
          normalizedFn,
          [...new Set(args)].sort((a, b) => a - b),
        ],
      ];
    }),
  );
}

function resolveUnits(options) {
  if (Array.isArray(options.units)) {
    return options.units.map((unit) => String(unit).toLowerCase());
  }

  return ['px', 'rem', 'em'];
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
  ignoreMathFunctionArguments: Object.freeze({
    entryValidator: isMathFunctionArgumentMap,
    expectsObject: true,
  }),
  mathFunctionArguments: Object.freeze({
    entryValidator: isMathFunctionArgumentMap,
    expectsObject: true,
  }),
  preset: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  scale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  unitStrategy: Object.freeze({
    entryValidator: isUnitStrategy,
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
  propertyGroups: Object.freeze({
    entryValidator: isPropertyGroupName,
    expectsArray: true,
  }),
  propertyScales: Object.freeze({
    entryValidator: isPropertyScaleMap,
    expectsObject: true,
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
  ignoreMathFunctionArguments: Object.freeze({
    entryValidator: isMathFunctionArgumentMap,
    expectsObject: true,
  }),
  ignoreValues: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  mathFunctionArguments: Object.freeze({
    entryValidator: isMathFunctionArgumentMap,
    expectsObject: true,
  }),
  preset: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  properties: Object.freeze({
    entryValidator: isPropertyPatternEntry,
    expectsArray: true,
  }),
  propertyGroups: Object.freeze({
    entryValidator: isPropertyGroupName,
    expectsArray: true,
  }),
  propertyScales: Object.freeze({
    entryValidator: isPropertyScaleMap,
    expectsObject: true,
  }),
  scale: Object.freeze({
    entryValidator: isScaleEntry,
    expectsArray: true,
  }),
  tailwindConfigPath: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  tokenFunctions: Object.freeze({
    entryValidator: isNonEmptyString,
    expectsArray: true,
  }),
  tokenMap: Object.freeze({
    entryValidator: isTokenMap,
    expectsObject: true,
  }),
  tokenMapFile: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  tokenMapFromCssCustomProperties: Object.freeze({
    entryValidator: isBoolean,
  }),
  tokenMapFromTailwindSpacing: Object.freeze({
    entryValidator: isBoolean,
  }),
  tokenPattern: Object.freeze({
    entryValidator: isNonEmptyString,
  }),
  unitStrategy: Object.freeze({
    entryValidator: isUnitStrategy,
  }),
  units: Object.freeze({
    entryValidator: isSupportedUnit,
    expectsArray: true,
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
    ignoreMathFunctionArguments: normalizeMathFunctionArgumentMap(options.ignoreMathFunctionArguments),
    ignoreValues: Array.isArray(options.ignoreValues)
      ? options.ignoreValues.map((value) => String(value).toLowerCase())
      : DEFAULT_IGNORE_KEYWORDS,
    invalidPreset: scaleSelection.invalidPreset,
    mathFunctionArguments: normalizeMathFunctionArgumentMap(options.mathFunctionArguments),
    preset: scaleSelection.selectedPreset,
    presetNames: listScalePresetNames(),
    properties: resolvePropertyPatterns(options),
    propertyGroups: normalizePropertyGroups(options.propertyGroups),
    propertyScaleOverrides: buildPropertyScaleOverrides(options.propertyScales),
    scale: scaleSelection.scale,
    tokenFunctions: Array.isArray(options.tokenFunctions)
      ? options.tokenFunctions.map((value) => String(value).toLowerCase())
      : ['var', 'theme', 'token'],
    tokenPattern:
      typeof options.tokenPattern === 'string' && options.tokenPattern.length > 0
        ? options.tokenPattern
        : '^--space-',
    unitStrategy: options.unitStrategy === 'exact' ? 'exact' : 'convert',
    units: resolveUnits(options),
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
    ignoreMathFunctionArguments: normalizeMathFunctionArgumentMap(options.ignoreMathFunctionArguments),
    ignoreValues: Array.isArray(options.ignoreValues)
      ? options.ignoreValues.map((value) => String(value).toLowerCase())
      : DEFAULT_IGNORE_KEYWORDS,
    invalidPreset: scaleSelection.invalidPreset,
    mathFunctionArguments: normalizeMathFunctionArgumentMap(options.mathFunctionArguments),
    preset: scaleSelection.selectedPreset,
    presetNames: listScalePresetNames(),
    properties: resolvePropertyPatterns(options),
    propertyGroups: normalizePropertyGroups(options.propertyGroups),
    propertyScaleOverrides: buildPropertyScaleOverrides(options.propertyScales),
    scale: scaleSelection.scale,
    tailwindConfigPath:
      typeof options.tailwindConfigPath === 'string' && options.tailwindConfigPath.length > 0
        ? options.tailwindConfigPath
        : null,
    tokenFunctions: Array.isArray(options.tokenFunctions)
      ? options.tokenFunctions.map((value) => String(value).toLowerCase())
      : ['var', 'theme', 'token'],
    tokenMap:
      options.tokenMap && typeof options.tokenMap === 'object'
        ? options.tokenMap
        : {},
    tokenMapFile:
      typeof options.tokenMapFile === 'string' && options.tokenMapFile.length > 0
        ? options.tokenMapFile
        : null,
    tokenMapFromCssCustomProperties: options.tokenMapFromCssCustomProperties === true,
    tokenMapFromTailwindSpacing: options.tokenMapFromTailwindSpacing === true,
    tokenPattern:
      typeof options.tokenPattern === 'string' && options.tokenPattern.length > 0
        ? options.tokenPattern
        : '^--space-',
    unitStrategy: options.unitStrategy === 'exact' ? 'exact' : 'convert',
    units: resolveUnits(options),
  };
}

function resolvePropertyScale(prop, options) {
  if (!Array.isArray(options.propertyScaleOverrides)) {
    return options.scale;
  }

  for (const override of options.propertyScaleOverrides) {
    if (override.matcher instanceof RegExp) {
      if (override.matcher.global || override.matcher.sticky) {
        override.matcher.lastIndex = 0;
      }

      if (override.matcher.test(prop)) {
        return override.scale;
      }

      continue;
    }

    if (String(override.matcher).toLowerCase() === prop.toLowerCase()) {
      return override.scale;
    }
  }

  return options.scale;
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
  resolvePropertyScale,
  validateNoOffscaleTransformSecondaryOptions,
  validatePreferTokenSecondaryOptions,
  validateUseScaleSecondaryOptions,
};
