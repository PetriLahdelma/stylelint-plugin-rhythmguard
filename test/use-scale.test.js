'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

const ruleConfig = {
  'rhythmguard/use-scale': [
    true,
    {
      scale: [0, 4, 8, 12, 16, 24, 32],
      baseFontSize: 16,
    },
  ],
};

test('use-scale accepts on-scale spacing values', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; padding: 1rem; gap: 8px; }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale rejects off-scale spacing values', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-scale');
  assert.match(result.warnings[0].text, /13px/);
});

test('use-scale allows token functions', async () => {
  const result = await lintCss({
    code: '.card { margin: var(--space-3); padding: theme(spacing.4); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale checks translate values in transform', async () => {
  const result = await lintCss({
    code: '.card { transform: translateX(13px) scale(1.05); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /off-scale/);
});

test('use-scale autofixes simple off-scale values', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    fix: true,
    rules: ruleConfig,
  });

  assert.equal(result.code, '.card { margin: 12px; }');
});
