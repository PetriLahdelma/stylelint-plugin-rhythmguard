'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');

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

test('eslint tailwind motion rule reports arbitrary duration and easing values', () => {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(
    'rhythmguard-tailwind/tailwind-class-use-motion-scale',
    eslintPlugin.rules['tailwind-class-use-motion-scale'],
  );

  const messages = linter.verify(
    "const classes = 'duration-[175ms] ease-[cubic-bezier(.2,0,0,1)] delay-[75ms]';",
    {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error',
      },
    },
  );

  assert.equal(messages.length, 2);
  assert.match(messages[0].message, /duration-\[175ms\]/);
  assert.match(messages[1].message, /ease-\[cubic-bezier/);
});

test('eslint tailwind motion rule autofixes nearest duration value', () => {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(
    'rhythmguard-tailwind/tailwind-class-use-motion-scale',
    eslintPlugin.rules['tailwind-class-use-motion-scale'],
  );

  const fixResult = linter.verifyAndFix(
    "const classes = 'duration-[175ms] delay-[0.175s]';",
    {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error',
      },
    },
  );

  assert.equal(fixResult.fixed, true);
  assert.equal(fixResult.output, "const classes = 'duration-[150ms] delay-[0.15s]';");
});
