'use strict';

module.exports = {
  extends: [
    'stylelint-plugin-logical-css/configs/recommended',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/use-scale': [
      true,
      {
        propertyGroups: ['spacing', 'size'],
      },
    ],
  },
};
