'use strict';

const tailwindClassUseScale = require('./rules/tailwind-class-use-scale');

module.exports = {
  rules: {
    'tailwind-class-use-scale': tailwindClassUseScale,
  },
  configs: {
    recommended: {
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': 'warn',
      },
    },
  },
};
