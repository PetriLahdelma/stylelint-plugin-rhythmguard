'use strict';

module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        scale: [0, 4, 8, 12, 16, 24, 32, 40, 48, 64],
      },
    ],
  },
};
