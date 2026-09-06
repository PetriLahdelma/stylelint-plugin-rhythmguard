'use strict';

/**
 * Secondary-option validation through Stylelint's `validateOptions`, plus the
 * shape checks it cannot express (arrays and objects). The schemas themselves
 * live in src/core/options.js and know nothing about Stylelint.
 */
const stylelint = require('stylelint');
const {
  NO_OFFSCALE_TRANSFORM_POSSIBLE_OPTIONS,
  NO_OFFSCALE_TRANSFORM_VALIDATION_SCHEMA,
  PREFER_TOKEN_POSSIBLE_OPTIONS,
  PREFER_TOKEN_VALIDATION_SCHEMA,
  USE_SCALE_POSSIBLE_OPTIONS,
  USE_SCALE_VALIDATION_SCHEMA,
  isPlainObject,
} = require('../core/options');

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

    const literalAllowed = Array.isArray(descriptor.allowLiterals)
      && descriptor.allowLiterals.includes(optionValue);

    if (descriptor.expectsArray && !Array.isArray(optionValue) && !literalAllowed) {
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
  validateNoOffscaleTransformSecondaryOptions,
  validatePreferTokenSecondaryOptions,
  validateUseScaleSecondaryOptions,
};
