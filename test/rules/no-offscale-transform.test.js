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

const SCALE = [0, 4, 8, 12, 16, 24, 32];

test('no-offscale-transform accepts tokenPattern and uses it for fixWith token (#237)', async () => {
  const result = await lintCss({
    code: ':root { --gap-3: 12px; --space-3: 12px; }\n.a { transform: translateX(13px); }',
    fix: true,
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, tokenPattern: '^--gap-', fixWith: 'token' }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.code, ':root { --gap-3: 12px; --space-3: 12px; }\n.a { transform: translateX(var(--gap-3)); }');
});

test('no-offscale-transform accepts tokenFunctions and skips values tokenized through them (#237)', async () => {
  const code = '.a { transform: translateX(tok(13px)); translate: tok(13px); }';
  const custom = await lintCss({
    code,
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, tokenFunctions: ['var', 'tok'] }] },
  });
  assert.deepEqual(custom.invalidOptionWarnings, []);
  assert.deepEqual(custom.warnings.map((warning) => warning.text), []);

  const defaults = await lintCss({ code, rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE }] } });
  assert.equal(defaults.warnings.length, 2);
});

test('no-offscale-transform reports an invalid tokenPattern instead of throwing (#237)', async () => {
  const result = await lintCss({
    code: '.a { transform: translateX(13px); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, tokenPattern: '(' }] },
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Invalid tokenPattern regex: ( (rhythmguard/no-offscale-transform)',
    'Unexpected transform translation value "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/no-offscale-transform)',
  ]);
});

test('no-offscale-transform reports negatives with allowNegative false (#238)', async () => {
  const result = await lintCss({
    code: '.a { transform: translateX(-8px); translate: -8px 8px; }',
    fix: true,
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, allowNegative: false }] },
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Unexpected transform translation value "-8px". Negative values are disabled for this rule. (rhythmguard/no-offscale-transform)',
    'Unexpected transform translation value "-8px". Negative values are disabled for this rule. (rhythmguard/no-offscale-transform)',
  ]);
  assert.equal(result.code, '.a { transform: translateX(-8px); translate: -8px 8px; }');
});

test('no-offscale-transform reports percentages with allowPercentages false (#238)', async () => {
  const result = await lintCss({
    code: '.a { transform: translateX(13%); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, allowPercentages: false }] },
  });

  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Unexpected transform translation value "13%". Percentages are disabled for this rule. (rhythmguard/no-offscale-transform)',
  ]);
});
