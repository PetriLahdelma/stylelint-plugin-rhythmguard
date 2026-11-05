'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lintCss } = require('../helpers/lint');

const plugin = require('../../src');

test('floor-compat: plugin exports shared configs', () => {
  assert.ok(plugin.configs.recommended);
  assert.ok(plugin.configs.strict);
  assert.ok(plugin.configs.tailwind);
  assert.ok(plugin.configs.motion);
});

test('floor-compat: use-scale reports off-scale spacing', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    rules: {
      'rhythmguard/use-scale': [true],
    },
  });

  assert.equal(result.errored, true);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-scale');
});

// The rules fix through the `fix` callback of utils.report(), which Stylelint
// reads from 16.7.0; on 16.0 to 16.6 --fix kept every warning and changed
// nothing, so the peer floor is 16.7.0 and the floor run proves fixes apply.
test('floor-compat: use-scale fixes off-scale spacing', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    fix: true,
    rules: {
      'rhythmguard/use-scale': [true],
    },
  });

  assert.equal(result.code, '.card { margin: 12px; }');
});

test('floor-compat: prefer-token reports raw spacing literals', async () => {
  const result = await lintCss({
    code: '.stack { gap: 12px; }',
    rules: {
      'rhythmguard/prefer-token': [true],
    },
  });

  assert.equal(result.errored, true);
  assert.equal(result.warnings[0].rule, 'rhythmguard/prefer-token');
});

test('floor-compat: no-offscale-transform reports off-scale translation', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(18px); }',
    rules: {
      'rhythmguard/no-offscale-transform': [true],
    },
  });

  assert.equal(result.errored, true);
  assert.equal(result.warnings[0].rule, 'rhythmguard/no-offscale-transform');
});

test('floor-compat: use-motion-scale reports off-scale duration', async () => {
  const result = await lintCss({
    code: '.chip { transition-duration: 175ms; }',
    rules: {
      'rhythmguard/use-motion-scale': [true],
    },
  });

  assert.equal(result.errored, true);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-motion-scale');
});
