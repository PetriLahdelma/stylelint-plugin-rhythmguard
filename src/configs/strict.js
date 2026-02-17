'use strict';

module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        // Keep transform-specific enforcement in no-offscale-transform
        // to avoid duplicate warnings in strict mode.
        properties: [
          /^margin(?:-.+)?$/,
          /^padding(?:-.+)?$/,
          /^gap$/,
          /^row-gap$/,
          /^column-gap$/,
          /^inset(?:-.+)?$/,
          /^scroll-margin(?:-.+)?$/,
          /^scroll-padding(?:-.+)?$/,
        ],
        scale: [0, 4, 8, 12, 16, 24, 32, 40, 48, 64],
      },
    ],
    'rhythmguard/no-offscale-transform': [
      true,
      {
        scale: [0, 4, 8, 12, 16, 24, 32],
      },
    ],
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--space-',
      },
    ],
  },
};
