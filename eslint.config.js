'use strict';

const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['benchmarks/**', 'coverage/**', 'docs/playground/rhythmguard.js', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        __dirname: 'readonly',
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
    },
  },
];
