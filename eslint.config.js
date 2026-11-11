'use strict';

const js = require('@eslint/js');

const noSilentCatch = require('./scripts/eslint/no-silent-catch');

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
    // Shipped code: no catch drops an error without saying why (cq-05).
    files: ['src/**/*.js'],
    plugins: { repo: { rules: { 'no-silent-catch': noSilentCatch } } },
    rules: { 'repo/no-silent-catch': 'error' },
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
