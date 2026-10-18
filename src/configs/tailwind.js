'use strict';

/** @type {import('../../types/shared').RhythmguardStylelintConfig} */
module.exports = {
  extends: [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--spacing-',
        tokenMapFromCssCustomProperties: true,
      },
    ],
  },
};
