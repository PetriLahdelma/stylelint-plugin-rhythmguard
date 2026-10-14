'use strict';

/**
 * The token index answers "which token should a fix write for this length".
 * It is deliberately strict: same px value, same unit, exactly one candidate.
 * Anything else falls back to a literal, because a fix that guesses a token is
 * worse than a fix that writes a number.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { addDefinition } = require('../../src/core/token-sources');
const { negateReplacement, tokenFitsProperty, tokenForLength, tokenIndexFromDefinitions, tokenKindOf, tokensForLength } = require('../../src/core/token-index');

function definitions(entries) {
  const map = new Map();
  for (const [token, value] of entries) addDefinition(map, { baseFontSize: 16, file: 'tokens.css', source: 'tokens.css', token, value });
  return map;
}

test('tokenIndexFromDefinitions records each token with its raw unit and px value', () => {
  const index = tokenIndexFromDefinitions(definitions([['--space-3', '12px'], ['--space-4', '1rem'], ['$spacer', '16px'], ['--space-fluid', 'clamp(1rem, 2vw, 2rem)']]));
  assert.deepEqual(index.map((entry) => [entry.token, entry.unit, entry.px]), [['--space-3', 'px', 12], ['--space-4', 'rem', 16], ['$spacer', 'px', 16]]);
});

test('tokenForLength requires the same px value, the same unit, a custom property, and exactly one candidate', () => {
  const index = tokenIndexFromDefinitions(definitions([['--space-3', '12px'], ['--space-4', '1rem'], ['$spacer', '16px'], ['--gap-md', '0.75rem']]));
  assert.equal(tokenForLength(index, 12, 'px'), 'var(--space-3)');
  assert.equal(tokenForLength(index, 12, 'rem'), 'var(--gap-md)', 'a rem literal gets the rem token');
  assert.equal(tokenForLength(index, 16, 'rem'), 'var(--space-4)');
  assert.equal(tokenForLength(index, 16, 'px'), null, 'the only 16px token is a Sass variable, not valid in CSS');
  assert.equal(tokenForLength(index, 8, 'px'), null);

  const ambiguous = tokenIndexFromDefinitions(definitions([['--space-3', '12px'], ['--spacing-md', '12px']]));
  assert.equal(tokenForLength(ambiguous, 12, 'px'), null, 'two tokens for one value is a guess, so no token');
});

test('negateReplacement writes valid CSS for a negative token', () => {
  assert.equal(negateReplacement('var(--space-3)'), 'calc(-1 * var(--space-3))');
  assert.equal(negateReplacement('theme(spacing.3)'), 'calc(-1 * theme(spacing.3))');
  assert.equal(negateReplacement('$spacer'), '-$spacer', 'Sass variables negate with a sign');
  assert.equal(negateReplacement('-var(--x)'), '-var(--x)', 'already negative stays as written');
});

test('tokenKindOf reads the kind a token name declares, and nothing from a name that declares none', () => {
  assert.equal(tokenKindOf('--space-internal-16'), 'spacing');
  assert.equal(tokenKindOf('--radius-xl'), 'radius');
  assert.equal(tokenKindOf('--font-size-text-m'), 'typography');
  assert.equal(tokenKindOf('--size-px--16'), 'size');
  assert.equal(tokenKindOf('--gap-md'), null);
});

test('tokenFitsProperty keeps radius and type tokens out of spacing, and lets spacing and size share', () => {
  assert.equal(tokenFitsProperty('--radius-xl', 'padding'), false);
  assert.equal(tokenFitsProperty('var(--radius-xl)', 'padding-inline'), false);
  assert.equal(tokenFitsProperty('--font-size-text-m', 'margin'), false);
  assert.equal(tokenFitsProperty('--space-4', 'border-radius'), false);
  assert.equal(tokenFitsProperty('--radius-xl', 'border-radius'), true);
  assert.equal(tokenFitsProperty('--size-px--16', 'padding'), true, 'mittwald and Open Props space with --size-*');
  assert.equal(tokenFitsProperty('--gap-md', 'border-radius'), true, 'a name without a kind is not excluded');
  assert.equal(tokenFitsProperty('--radius-xl', null), true);
});

test('tokensForLength lists every matching token for the property, sorted, and other units only on request', () => {
  const index = tokenIndexFromDefinitions(definitions([['--space-layout-16', '1rem'], ['--space-internal-16', '1rem'], ['--radius-xl', '1rem'], ['--space-px-16', '16px']]));
  assert.deepEqual(tokensForLength(index, 16, 'rem', { prop: 'padding' }), ['--space-internal-16', '--space-layout-16']);
  assert.deepEqual(tokensForLength(index, 16, 'rem', { prop: 'border-radius' }), ['--radius-xl']);
  assert.deepEqual(tokensForLength(index, 16, 'em', { prop: 'padding' }), []);
  assert.deepEqual(tokensForLength(index, 16, 'em', { anyUnit: true, prop: 'padding' }), ['--space-internal-16', '--space-layout-16', '--space-px-16']);
  assert.equal(tokenForLength(index, 16, 'px', 'padding'), 'var(--space-px-16)');
});

test('no property outside the radius corners resolves to a radius token', () => {
  const { all: knownCssProperties } = require('known-css-properties');
  const { PROPERTY_GROUP_PATTERNS } = require('../../src/core/css-vocabulary');
  const patterns = Object.values(PROPERTY_GROUP_PATTERNS).flat();
  const checked = knownCssProperties.filter((prop) => patterns.some((pattern) => pattern.test(prop)));
  assert.ok(checked.includes('outline-offset'));
  for (const prop of checked) {
    assert.equal(tokenFitsProperty('--radius-sm', prop), /radius$/.test(prop), prop);
  }
});

test('outline-offset takes spacing tokens: it is the gap to the outline, not a corner', () => {
  assert.equal(tokenFitsProperty('--space-2', 'outline-offset'), true);
  assert.equal(tokenFitsProperty('--radius-sm', 'outline-offset'), false);
});
