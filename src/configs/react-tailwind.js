'use strict';

module.exports = {
  extends: [
    'stylelint-plugin-rhythmguard/configs/tailwind',
  ],
  ignoreFiles: [
    '.next/**',
    'out/**',
    'node_modules/**',
  ],
  overrides: [
    {
      files: ['**/*.module.css'],
      rules: {
        'rhythmguard/use-scale': [
          true,
          {
            propertyGroups: ['spacing', 'radius'],
          },
        ],
      },
    },
  ],
};
