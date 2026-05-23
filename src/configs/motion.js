'use strict';

module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-motion-scale': [
      true,
      {
        durationScale: [0, 75, 100, 150, 200, 300, 500, 700, 1000],
      },
    ],
  },
};
