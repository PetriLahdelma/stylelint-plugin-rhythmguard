'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

const baseRule = {
  'rhythmguard/prefer-token': [
    true,
    {
      tokenPattern: '^--space-',
      scale: [0, 4, 8, 12, 16, 24, 32],
    },
  ],
};

test('prefer-token rejects raw spacing values', async () => {
  const result = await lintCss({
    code: '.stack { gap: 12px; }',
    rules: baseRule,
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/prefer-token');
});

test('prefer-token accepts tokenized values', async () => {
  const result = await lintCss({
    code: '.stack { gap: var(--space-3); margin: token(space.2); }',
    rules: baseRule,
  });

  assert.equal(result.warnings.length, 0);
});

test('prefer-token can allow numeric scale values during migration', async () => {
  const result = await lintCss({
    code: '.stack { gap: 12px; margin: 13px; }',
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          allowNumericScale: true,
          scale: [0, 4, 8, 12, 16, 24, 32],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /13px/);
});

test('prefer-token can autofix with tokenMap', async () => {
  const result = await lintCss({
    code: '.stack { gap: 12px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMap: {
            '12px': 'var(--space-3)',
          },
        },
      ],
    },
  });

  assert.equal(result.code, '.stack { gap: var(--space-3); }');
});
