'use strict';

/**
 * Contract tests for the primitives the Stylelint rules are built from. The
 * rule suites prove end-to-end behaviour; these pin the pieces a fifth rule
 * would reuse.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { fixedLengthValue, parseLengthToken } = require('../../src/core/length');
const { buildScaleOptions, createPropertyScaleResolver } = require('../../src/core/options');
const { withResolvedScale } = require('../../src/core/scale-inference');

const px = { baseFontSize: 16, unitStrategy: 'convert', units: ['px', 'rem', 'em'] };

test('fixedLengthValue keeps the sign and the unit, converting through px unless the strategy is exact', () => {
  assert.equal(fixedLengthValue(parseLengthToken('13px'), 12, px), '12px');
  assert.equal(fixedLengthValue(parseLengthToken('-13px'), 12, px), '-12px');
  assert.equal(fixedLengthValue(parseLengthToken('0.8rem'), 12, px), '0.75rem');
  assert.equal(fixedLengthValue(parseLengthToken('13vw'), 12, px), null, 'units the rule may not rewrite give no fix');
  assert.equal(fixedLengthValue(parseLengthToken('50%'), 12, { ...px, units: ['%'] }), null, 'percentages are never rewritten');
  assert.equal(fixedLengthValue(parseLengthToken('0.8rem'), 12, { ...px, unitStrategy: 'exact' }), '12rem', 'exact keeps the unit as written');
});

test('createPropertyScaleResolver returns one normalised scale state per property and caches it', () => {
  const options = buildScaleOptions({ scale: [0, 4, 8], propertyScales: { gap: [0, 10, 20] } });
  const resolve = createPropertyScaleResolver(options);
  const margin = resolve('margin');
  assert.deepEqual(margin.scalePx, [0, 4, 8]);
  assert.deepEqual(resolve('gap').scalePx, [0, 10, 20]);
  assert.equal(resolve('margin'), margin, 'same object on the second lookup');
});

test('withResolvedScale leaves options with an explicit scale untouched', () => {
  const options = buildScaleOptions({ scale: [0, 4, 8] });
  const before = options.scale;
  assert.equal(withResolvedScale(options, null), options);
  assert.equal(options.scale, before);
  assert.equal(options.scaleInference, undefined);
});
