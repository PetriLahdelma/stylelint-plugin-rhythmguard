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
const { negateReplacement, tokenForLength, tokenIndexFromDefinitions } = require('../../src/core/token-index');

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
