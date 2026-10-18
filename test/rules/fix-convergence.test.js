'use strict';

/**
 * A fix writes rem and em with four decimals. At a base font size other than
 * 16 the written value is not exactly the scale step (0.6667rem at 18px is
 * 12.0006px), and the next run must still read it as on the scale (issue #224).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const BASES = [10, 12, 14, 18, 20];
const SCALE = [0, 2, 4, 6, 8, 12, 16, 24, 32];

async function fixTwice(code, rules) {
  const first = await lintCss({ code, rules, fix: true });
  const second = await lintCss({ code: first.code, rules, fix: true });
  const again = await lintCss({ code: second.code, rules });
  return { again, first, second };
}

for (const baseFontSize of BASES) {
  test(`use-scale fix then re-lint is clean at baseFontSize ${baseFontSize}`, async () => {
    const code = '.a { padding: 0.7rem; margin: 0.3rem 1.1em; gap: 0.45rem; inset: -0.7rem; }';
    const rules = { 'rhythmguard/use-scale': [true, { baseFontSize, scale: SCALE }] };
    const { again, first, second } = await fixTwice(code, rules);
    assert.notEqual(first.code, code, 'the first pass fixes something');
    assert.equal(second.code, first.code, 'the second pass changes nothing');
    assert.deepEqual(again.warnings.map((warning) => warning.text), [], first.code);
  });

  test(`no-offscale-transform fix then re-lint is clean at baseFontSize ${baseFontSize}`, async () => {
    const code = '.a { transform: translate(0.7em, -0.3rem); translate: 0.45rem 1.1em; }';
    const rules = { 'rhythmguard/no-offscale-transform': [true, { baseFontSize, scale: SCALE }] };
    const { again, first, second } = await fixTwice(code, rules);
    assert.notEqual(first.code, code, 'the first pass fixes something');
    assert.equal(second.code, first.code, 'the second pass changes nothing');
    assert.deepEqual(again.warnings.map((warning) => warning.text), [], first.code);
  });
}

test('the issue #224 repro: 0.7rem at base 18 fixes to 0.6667rem and stays fixed', async () => {
  const rules = { 'rhythmguard/use-scale': [true, { baseFontSize: 18 }] };
  const first = await lintCss({ code: '.a { padding: 0.7rem; }', rules, fix: true });
  assert.equal(first.code, '.a { padding: 0.6667rem; }');
  const again = await lintCss({ code: first.code, rules });
  assert.deepEqual(again.warnings.map((warning) => warning.text), []);
});
