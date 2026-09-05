'use strict';

const useScale = require('./rules/use-scale');
const preferToken = require('./rules/prefer-token');
const noOffscaleTransform = require('./rules/no-offscale-transform');
const useMotionScale = require('./rules/use-motion-scale');

const rules = [useScale, preferToken, noOffscaleTransform, useMotionScale];

module.exports = rules;
module.exports.rules = {
  [useScale.ruleName]: useScale,
  [preferToken.ruleName]: preferToken,
  [noOffscaleTransform.ruleName]: noOffscaleTransform,
  [useMotionScale.ruleName]: useMotionScale,
};
module.exports.configs = {
  embed: require('./configs/embed'),
  recommended: require('./configs/recommended'),
  strict: require('./configs/strict'),
  tailwind: require('./configs/tailwind'),
  expanded: require('./configs/expanded'),
  logical: require('./configs/logical'),
  migration: require('./configs/migration'),
  motion: require('./configs/motion'),
  'react-tailwind': require('./configs/react-tailwind'),
};
module.exports.eslint = require('./eslint');
module.exports.presets = require('./presets');
module.exports.audit = require('./audit');
