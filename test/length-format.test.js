'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { formatLength } = require('../src/core/length');
const { getNormalizedValueKeys } = require('../src/core/token-sources');
const { lintCss } = require('./helpers/lint');

test('formatLength keeps the zeros of whole numbers and trims only fractional zeros', () => {
  assert.equal(formatLength(30, 'px'), '30px');
  assert.equal(formatLength(60, 'px'), '60px');
  assert.equal(formatLength(100, 'rem'), '100rem');
  assert.equal(formatLength(10, 'px'), '10px');
  assert.equal(formatLength(1.5, 'px'), '1.5px');
  assert.equal(formatLength(1.5, 'rem'), '1.5rem');
  assert.equal(formatLength(0.1, 'em'), '0.1em');
  assert.equal(formatLength(12, 'px'), '12px');
  assert.equal(formatLength(0, 'px'), '0px');
  assert.equal(formatLength(0, 'rem'), '0');
});

test('getNormalizedValueKeys does not invent a value by dropping a trailing zero', () => {
  assert.deepEqual(getNormalizedValueKeys('30px', 16), ['30px']);
  assert.deepEqual(getNormalizedValueKeys('60px', 16), ['60px']);
  assert.deepEqual(getNormalizedValueKeys('2.5rem', 16), ['2.5rem', '40px']);
});

test('use-scale names and fixes to round-ten scale values correctly', async () => {
  const rules = { 'rhythmguard/use-scale': [true, { scale: [0, 10, 30, 60, 100] }] };
  const result = await lintCss({ code: '.a { margin: 33px; padding: 95px; }', rules });
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"33px".*nearest: 30px or 60px/);
  assert.match(texts[1], /"95px".*nearest: 60px or 100px/);

  const fixed = await lintCss({ code: '.a { margin: 33px; padding: 95px; }', rules, fix: true });
  assert.equal(fixed.code, '.a { margin: 30px; padding: 100px; }');
});
