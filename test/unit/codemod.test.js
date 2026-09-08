'use strict';

/**
 * The targeted codemod replaces one length with one replacement, on spacing
 * properties, matching by px so `0.625rem` and `10px` are the same value. It
 * never touches token definitions or values already inside a token function,
 * and it keeps the sign.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const postcss = require('postcss');

const { replaceLength } = require('../../src/audit/codemod');

function run(css, options) {
  const root = postcss.parse(css);
  const changes = replaceLength(root, { baseFontSize: 16, ...options });
  return { changes, css: root.toString() };
}

test('replaceLength swaps every spacing literal equal to the value, across units, keeping the sign', () => {
  const { changes, css } = run(
    '.a { margin: 10px; padding: 10px 15px; gap: 0.625rem; inset: -10px; }',
    { px: 10, replacement: 'var(--space-sm)' },
  );
  assert.equal(css, '.a { margin: var(--space-sm); padding: var(--space-sm) 15px; gap: var(--space-sm); inset: calc(-1 * var(--space-sm)); }');
  assert.equal(changes.length, 4);
  assert.deepEqual(changes[0], { column: 14, from: '10px', line: 1, property: 'margin', to: 'var(--space-sm)' });
});

test('replaceLength leaves token definitions, token functions, non-spacing properties and other values alone', () => {
  const { changes, css } = run(
    ':root { --space-sm: 10px; }\n.a { font-size: 10px; width: 10px; margin: var(--x, 10px); padding: 110px; border-width: 10px; }',
    { px: 10, replacement: 'var(--space-sm)' },
  );
  assert.equal(css, ':root { --space-sm: 10px; }\n.a { font-size: 10px; width: 10px; margin: var(--x, 10px); padding: 110px; border-width: 10px; }');
  assert.equal(changes.length, 0);
});

test('replaceLength can be limited to some properties and can write a literal', () => {
  const { css } = run('.a { margin: 10px; padding: 10px; }', { px: 10, properties: ['margin'], replacement: '8px' });
  assert.equal(css, '.a { margin: 8px; padding: 10px; }');
});
