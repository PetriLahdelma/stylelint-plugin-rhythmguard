'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

test('use-scale supports property groups beyond spacing', async () => {
  const result = await lintCss({
    code: '.card { border-radius: 10px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          propertyGroups: ['radius'],
          scale: [0, 4, 8, 12, 16],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-scale');
});

test('use-scale supports per-property scale overrides', async () => {
  const result = await lintCss({
    code: '.card { margin: 6px; padding: 6px; }',
    fix: true,
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          properties: ['margin', 'padding'],
          propertyScales: {
            margin: [0, 2, 4, 6, 8],
          },
          scale: [0, 4, 8, 12],
        },
      ],
    },
  });

  assert.equal(result.code, '.card { margin: 6px; padding: 4px; }');
});

test('use-scale supports exact unit strategy for non-convertible units', async () => {
  const result = await lintCss({
    code: '.card { margin: 3vw; }',
    fix: true,
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          scale: ['0vw', '2vw', '4vw'],
          unitStrategy: 'exact',
          units: ['vw'],
        },
      ],
    },
  });

  assert.equal(result.code, '.card { margin: 2vw; }');
});

test('use-scale supports math argument targeting', async () => {
  const result = await lintCss({
    code: '.card { margin: clamp(9px, 5vw, 13px); }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          enforceInsideMathFunctions: true,
          mathFunctionArguments: {
            clamp: [1, 3],
          },
          scale: [0, 4, 8, 12, 16],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => warning.rule === 'rhythmguard/use-scale'));
});

test('use-scale supports regex-like string patterns in properties', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; padding: 13px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          properties: ['/^(margin|padding)$/'],
          scale: [0, 4, 8, 12, 16],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
});

test('use-scale handles stateful global regex in properties deterministically', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; padding: 13px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          properties: [/^(margin|padding)$/g],
          scale: [0, 4, 8, 12, 16],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
});

test('use-scale handles stateful global regex in propertyScales deterministically', async () => {
  const result = await lintCss({
    code: '.card { margin: 8px; padding: 8px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          propertyScales: {
            '/^(margin|padding)$/g': [0, 4],
          },
          scale: [0, 4, 8, 12],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
});
