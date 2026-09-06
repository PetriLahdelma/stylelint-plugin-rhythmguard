'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

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

test('no-offscale-transform ignores nested calc values in transform by default', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(calc(10px + 3px)); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('no-offscale-transform lints nested calc values in transform when enabled', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(calc(10px + 3px)); }',
    rules: {
      'rhythmguard/no-offscale-transform': [
        true,
        {
          scale: [0, 4, 8, 12, 16, 24, 32],
          enforceInsideMathFunctions: true,
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => warning.rule === 'rhythmguard/no-offscale-transform'));
});

test('no-offscale-transform ignores unitless non-zero values', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(18); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('no-offscale-transform allows percentage translations by default', async () => {
  const { lintCss: lint } = require('../helpers/lint');
  const assertStrict = require('node:assert/strict');
  const result = await lint({
    code: '.center { transform: translate(-50%, -50%) scale(1); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: [0, 4, 8, 12, 16] }] },
  });
  assertStrict.equal(result.warnings.length, 0, result.warnings.map((w) => w.text).join('\n'));
});

test('no-offscale-transform treats one-pixel translations as hairlines unless allowHairlines is false', async () => {
  const { lintCss: lint } = require('../helpers/lint');
  const assertStrict = require('node:assert/strict');
  const code = '.a { transform: translateY(1px) translateX(-0.5px); translate: 1px 6px; }';

  const relaxed = await lint({ code, rules: { 'rhythmguard/no-offscale-transform': [true, { scale: [0, 4, 8, 12, 16] }] } });
  assertStrict.equal(relaxed.warnings.length, 1, relaxed.warnings.map((w) => w.text).join('\n'));
  assertStrict.match(relaxed.warnings[0].text, /"6px"/);

  const strict = await lint({ code, rules: { 'rhythmguard/no-offscale-transform': [true, { scale: [0, 4, 8, 12, 16], allowHairlines: false }] } });
  assertStrict.equal(strict.warnings.length, 4, strict.warnings.map((w) => w.text).join('\n'));
});
