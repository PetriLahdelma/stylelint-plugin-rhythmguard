'use strict';

const useScale = require('./rules/use-scale');
const preferToken = require('./rules/prefer-token');
const noOffscaleTransform = require('./rules/no-offscale-transform');

const rules = [useScale, preferToken, noOffscaleTransform];

module.exports = rules;
module.exports.rules = {
  [useScale.ruleName]: useScale,
  [preferToken.ruleName]: preferToken,
  [noOffscaleTransform.ruleName]: noOffscaleTransform,
};
module.exports.configs = {
  recommended: require('./configs/recommended'),
  strict: require('./configs/strict'),
};
