'use strict';

/**
 * The decisions section of .rhythmguardrc.json: one entry per off-scale value a
 * team has looked at. `adopt` makes the value part of the scale, `allow` stops
 * it being a finding (optionally on some properties only), `snap` records that
 * it is a slip to fix, `undecided` records that nobody has decided yet.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { decisionFor, normalizeDecisions } = require('../../src/core/decisions');

test('normalizeDecisions parses values to px and keeps the fields the rules need', () => {
  const decisions = normalizeDecisions([
    { value: '10px', decision: 'adopt', as: '--space-2xs' },
    { value: '0.9375rem', decision: 'snap' },
    { value: '2px', decision: 'allow', reason: 'borders and focus rings', properties: ['outline-offset', 'border-*'] },
    { value: '22px', decision: 'undecided', count: 3, nearest: ['20px', '24px'] },
  ], { baseFontSize: 16 });

  assert.deepEqual(decisions.map((entry) => [entry.px, entry.decision]), [[10, 'adopt'], [15, 'snap'], [2, 'allow'], [22, 'undecided']]);
  assert.equal(decisions[0].as, '--space-2xs');
  assert.deepEqual(decisions[2].properties, ['outline-offset', 'border-*']);
  assert.equal(decisions[2].reason, 'borders and focus rings');
});

test('normalizeDecisions refuses what it cannot act on, naming the entry', () => {
  assert.throws(() => normalizeDecisions([{ value: 'lots', decision: 'snap' }]), /decisions\[0\]\.value must be a CSS length/);
  assert.throws(() => normalizeDecisions([{ value: '10px', decision: 'maybe' }]), /decisions\[0\]\.decision must be one of adopt, allow, snap, undecided/);
  assert.throws(() => normalizeDecisions([{ value: '10px', decision: 'allow', properties: 'border' }]), /decisions\[0\]\.properties must be an array of property names or patterns/);
  assert.throws(() => normalizeDecisions([{ value: '10px', decision: 'adopt', as: 'space-2xs' }]), /decisions\[0\]\.as must be a custom property or Sass variable name/);
  assert.throws(() => normalizeDecisions({ value: '10px' }), /decisions must be an array/);
});

test('decisionFor matches by px value and by property scope', () => {
  const decisions = normalizeDecisions([
    { value: '10px', decision: 'adopt' },
    { value: '2px', decision: 'allow', properties: ['outline-offset', 'border-*'] },
    { value: '15px', decision: 'snap' },
  ], { baseFontSize: 16 });

  assert.equal(decisionFor(10, 'margin', decisions).decision, 'adopt');
  assert.equal(decisionFor(0.625 * 16, 'padding', decisions).decision, 'adopt', 'rem values match through px');
  assert.equal(decisionFor(2, 'outline-offset', decisions).decision, 'allow');
  assert.equal(decisionFor(2, 'border-top-width', decisions).decision, 'allow', 'a trailing * matches a property prefix');
  assert.equal(decisionFor(2, 'padding', decisions), null, 'an allow scoped to properties does not cover others');
  assert.equal(decisionFor(15, 'padding', decisions).decision, 'snap');
  assert.equal(decisionFor(13, 'padding', decisions), null);
});
