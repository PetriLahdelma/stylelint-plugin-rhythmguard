'use strict';

const tailwindClassUseScale = require('./rules/tailwind-class-use-scale');
const tailwindClassUseMotionScale = require('./rules/tailwind-class-use-motion-scale');

module.exports = {
  rules: {
    'tailwind-class-use-scale': tailwindClassUseScale,
    'tailwind-class-use-motion-scale': tailwindClassUseMotionScale,
  },
  configs: {
    recommended: {
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': 'warn',
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'off',
      },
    },
  },
};
