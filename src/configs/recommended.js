'use strict';

const { DEFAULT_SCALE } = require('../presets/default-scale');

/** @type {import('../../types/shared').RhythmguardStylelintConfig} */
module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        scale: [...DEFAULT_SCALE],
      },
    ],
  },
};
