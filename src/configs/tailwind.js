'use strict';

const strict = require('./strict');

// Tailwind projects: the scale is read from the project's tokens (`@theme`
// `--spacing` and `--spacing-*`, `scaleSources`, the rc), and when none are
// found it is Tailwind's default ladder, not rhythmic-4, so standard steps
// such as 20px (p-5), 28px (p-7) and 44px (p-11) are on the scale (css-01).
const SCALE = /** @type {const} */ ({ preset: 'tailwind', scale: 'auto' });
// The spacing properties strict checks; transforms stay in no-offscale-transform.
const { properties } = /** @type {any} */ (strict.rules)['rhythmguard/use-scale'][1];

/** @type {import('../../types/shared').RhythmguardStylelintConfig} */
module.exports = {
  extends: [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/use-scale': [
      true,
      { properties, ...SCALE },
    ],
    'rhythmguard/no-offscale-transform': [true, { ...SCALE }],
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--spacing-',
        tokenMapFromCssCustomProperties: true,
      },
    ],
  },
};
