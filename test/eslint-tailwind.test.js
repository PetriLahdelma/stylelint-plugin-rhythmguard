'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../src/eslint');

test('eslint tailwind class rule reports off-scale arbitrary values', () => {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(
    'rhythmguard-tailwind/tailwind-class-use-scale',
    eslintPlugin.rules['tailwind-class-use-scale'],
  );

  const messages = linter.verify(
    "const classes = 'p-[13px] gap-[8px]';",
    {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': ['error', {
          scale: [0, 4, 8, 12, 16, 24, 32],
        }],
      },
    },
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /p-\[13px\]/);
});

test('eslint tailwind class rule autofixes nearest value', () => {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(
    'rhythmguard-tailwind/tailwind-class-use-scale',
    eslintPlugin.rules['tailwind-class-use-scale'],
  );

  const fixResult = linter.verifyAndFix(
    "const classes = 'p-[13px]';",
    {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': ['error', {
          scale: [0, 4, 8, 12, 16, 24, 32],
        }],
      },
    },
  );

  assert.equal(fixResult.fixed, true);
  assert.equal(fixResult.output, "const classes = 'p-[12px]';");
});
