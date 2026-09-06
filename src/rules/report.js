'use strict';

/**
 * The Stylelint side of a rule: everything that touches `stylelint.utils` or
 * the PostCSS result lives here, so that src/core stays free of the framework
 * and the same primitives can serve the ESLint plugin and the audit.
 */
const stylelint = require('stylelint');
const { declarationValueIndex } = require('../core/value-nodes');

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

/**
 * Report one value node inside a declaration, positioned on the node rather
 * than the whole declaration, with an optional fix. The default fix replaces
 * the node's text; pass `fix` for anything else.
 */
function reportValueNode({ decl, fix = null, length = null, message, node, replacement = null, result, ruleName }) {
  const index = declarationValueIndex(decl) + node.sourceIndex;
  const payload = {
    endIndex: index + (length === null ? node.value.length : length),
    index,
    message,
    node: decl,
    result,
    ruleName,
  };

  if (fix) {
    payload.fix = fix;
  } else if (replacement) {
    payload.fix = () => {
      node.value = replacement;
      return true;
    };
  }

  stylelint.utils.report(payload);
}

/** A preset name the options did not recognise is reported once, on the root. */
function reportInvalidPreset(options, { message, result, root, ruleName }) {
  if (!options.invalidPreset) {
    return;
  }
  stylelint.utils.report({
    message: message(options.invalidPreset, options.presetNames),
    node: root,
    result,
    ruleName,
  });
}

module.exports = {
  createTokenRegex,
  reportInvalidPreset,
  reportValueNode,
};
