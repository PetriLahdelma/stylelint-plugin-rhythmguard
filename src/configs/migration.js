'use strict';

module.exports = {
  plugins: ['stylelint-plugin-rhythmguard'],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        propertyGroups: ['spacing', 'radius'],
        scale: [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64],
      },
    ],
    'rhythmguard/prefer-token': [
      true,
      {
        allowNumericScale: true,
        propertyGroups: ['spacing', 'radius'],
        tokenMapFromCssCustomProperties: true,
        tokenMapFromTailwindSpacing: true,
        tailwindConfigPath: './tailwind.config.js',
        tokenPattern: '^--space-|^--radius-',
      },
    ],
    'rhythmguard/no-offscale-transform': [
      true,
      {
        scale: [0, 4, 8, 12, 16, 24, 32],
      },
    ],
  },
};
