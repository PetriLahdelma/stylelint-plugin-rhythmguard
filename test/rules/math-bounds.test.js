'use strict';

/**
 * `checkMathBounds` (issue #203): the static bounds of clamp(), min() and
 * max() are checked like literals, so wrapping a value in clamp() is no longer
 * a way to leave the scale without a finding. The preferred value of clamp()
 * is fluid by design and never checked.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const SCALE = [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64];
const useScale = (extra = {}) => ({
  'rhythmguard/use-scale': [true, { checkMathBounds: true, propertyGroups: ['spacing', 'typography'], scale: SCALE, ...extra }],
});
const texts = (result) => result.warnings.map((warning) => warning.text);

test('clamp() minimum and maximum are reported with their position; the preferred value is not', async () => {
  const result = await lintCss({
    code: '.a { padding: clamp(13px, 2vi, 17px); font-size: clamp(0.875rem, 0.35vi + 0.8rem, 1.05rem); }',
    rules: useScale(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(texts(result), [
    'Unexpected off-scale clamp() minimum "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)',
    'Unexpected off-scale clamp() maximum "17px". Use scale values (nearest: 16px or 24px). (rhythmguard/use-scale)',
    'Unexpected off-scale clamp() minimum "0.875rem" (14px). Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)',
    'Unexpected off-scale clamp() maximum "1.05rem" (16.8px). Use scale values (nearest: 16px or 24px). (rhythmguard/use-scale)',
  ]);
});

test('every length argument of min() and max() is a bound, nested functions included', async () => {
  const result = await lintCss({
    code: '.a { margin: max(12px, min(5vw, 13px)); padding: min(3px, var(--space-4), calc(1rem + 2px)); }',
    rules: useScale(),
  });

  assert.deepEqual(texts(result), [
    'Unexpected off-scale min() argument "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)',
    'Unexpected off-scale min() argument "3px". Use scale values (nearest: 2px or 4px). (rhythmguard/use-scale)',
  ]);
});

test('without checkMathBounds, clamp(), min() and max() stay unchecked as before', async () => {
  const result = await lintCss({
    code: '.a { padding: 13px; padding: clamp(13px, 2vi, 17px); margin: min(13px, 5vw); }',
    rules: useScale({ checkMathBounds: false }),
  });

  assert.deepEqual(texts(result), ['Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)']);
});

test('--fix snaps each bound like a literal and leaves the preferred value alone', async () => {
  const result = await lintCss({
    code: '.a { padding: clamp(13px, 0.5vi + 0.8rem, 17px); margin: max(-13px, -2vw); }',
    fix: true,
    rules: useScale(),
  });

  assert.equal(result.code, '.a { padding: clamp(12px, 0.5vi + 0.8rem, 16px); margin: max(-12px, -2vw); }');
});

test('fixWith: "token" applies per bound', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; --space-4: 16px; }\n.a { padding: clamp(13px, 2vi, 17px); }',
    fix: true,
    rules: useScale({ fixWith: 'token' }),
  });

  assert.equal(result.code, ':root { --space-3: 12px; --space-4: 16px; }\n.a { padding: clamp(var(--space-3), 2vi, var(--space-4)); }');
});

test('with enforceInsideMathFunctions as well, a bound is reported once', async () => {
  const result = await lintCss({
    code: '.a { padding: clamp(13px, 2vi, 17px); }',
    rules: useScale({ enforceInsideMathFunctions: true }),
  });

  assert.equal(result.warnings.length, 2, texts(result).join('\n'));
});

test('prefer-token checks bounds too and names the position', async () => {
  const result = await lintCss({
    code: ':root { --space-4: 1rem; }\n.a { padding: clamp(1rem, 2vi, 1.25rem); }',
    fix: true,
    rules: { 'rhythmguard/prefer-token': [true, { checkMathBounds: true }] },
  });
  assert.equal(result.code, ':root { --space-4: 1rem; }\n.a { padding: clamp(var(--space-4), 2vi, 1.25rem); }');

  const linted = await lintCss({
    code: ':root { --space-4: 1rem; }\n.a { padding: clamp(1rem, 2vi, 1.25rem); }',
    rules: { 'rhythmguard/prefer-token': [true, { checkMathBounds: true }] },
  });
  assert.deepEqual(texts(linted), [
    'Unexpected raw clamp() minimum "1rem". Use var(--space-4). (rhythmguard/prefer-token)',
    'Unexpected raw clamp() maximum "1.25rem". No known token holds this value; use the nearest token or add one. (rhythmguard/prefer-token)',
  ]);
});

test('checkMathBounds must be a boolean', async () => {
  const result = await lintCss({ code: '.a { padding: 13px; }', rules: useScale({ checkMathBounds: 'yes' }) });
  assert.equal(result.invalidOptionWarnings.length, 1);
});
