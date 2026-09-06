'use strict';

/**
 * The Stylelint side of a rule: everything that touches `stylelint.utils` or
 * the PostCSS result lives here, so that src/core stays free of the framework
 * and the same primitives can serve the ESLint plugin and the audit.
 */
const stylelint = require('stylelint');

/**
 * Compile a user-supplied token pattern. An invalid pattern is reported once
 * against the root and replaced with the historical default so the file still
 * lints instead of throwing inside Stylelint.
 */
function createTokenRegex(tokenPattern, result, ruleName) {
  try {
    return new RegExp(tokenPattern);
  } catch {
    stylelint.utils.report({
      message: `Invalid tokenPattern regex: ${tokenPattern}`,
      result,
      ruleName,
    });

    return /^--space-/;
  }
}

module.exports = {
  createTokenRegex,
};
