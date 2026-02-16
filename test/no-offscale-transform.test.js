'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

const ruleConfig = {
  'rhythmguard/no-offscale-transform': [
    true,
    {
      scale: [0, 4, 8, 12, 16, 24, 32],
    },
  ],
};

test('no-offscale-transform flags off-scale transform spacing', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(18px) scale(1); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/no-offscale-transform');
});

test('no-offscale-transform allows on-scale transform spacing', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(16px) scale(1); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('no-offscale-transform autofixes values', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(18px) scale(1); }',
    fix: true,
    rules: ruleConfig,
  });

  assert.equal(result.code, '.chip { transform: translateY(16px) scale(1); }');
});
