'use strict';

// Issue #240: a var() whose name matches tokenPattern is a token, but its
// fallback is a value like any other. Only the name is skipped; the fallback
// is walked, also when it is itself a var() with a fallback.

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const SCALE = [0, 4, 8, 12, 16, 24];
const useScale = (extra = {}) => ({ 'rhythmguard/use-scale': [true, { scale: SCALE, ...extra }] });
const preferToken = (extra = {}) => ({ 'rhythmguard/prefer-token': [true, extra] });

test('use-scale checks and fixes a raw length in the fallback of a token var()', async () => {
  const code = '.a { padding: var(--space-1, 7px); gap: var(--nope, 13px); }';
  const reported = await lintCss({ code, rules: useScale() });
  assert.deepEqual(reported.warnings.map((w) => [w.column, w.text.split('.')[0]]), [
    [code.indexOf('7px') + 1, 'Unexpected off-scale value "7px"'],
    [code.indexOf('13px') + 1, 'Unexpected off-scale value "13px"'],
  ]);
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { padding: var(--space-1, 8px); gap: var(--nope, 12px); }');
});

test('use-scale walks a nested var() fallback', async () => {
  const code = '.a { padding: var(--space-a, var(--space-b, 7px)); margin: var(--space-a, var(--space-b)); }';
  const reported = await lintCss({ code, rules: useScale() });
  assert.deepEqual(reported.warnings.map((w) => w.column), [code.indexOf('7px') + 1]);
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { padding: var(--space-a, var(--space-b, 8px)); margin: var(--space-a, var(--space-b)); }');
});

test('use-scale checks a token var() fallback inside translate()', async () => {
  const code = '.a { transform: translate(var(--space-1, 7px), 0); }';
  const reported = await lintCss({ code, rules: useScale({ properties: ['transform'] }) });
  assert.equal(reported.warnings.length, 1);
  assert.equal(reported.warnings[0].column, code.indexOf('7px') + 1);
});

test('no-offscale-transform checks the fallback of a token var()', async () => {
  const rules = { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE }] };
  const code = '.a { transform: translateX(var(--space-2, 13px)); }';
  const reported = await lintCss({ code, rules });
  assert.deepEqual(reported.warnings.map((w) => [w.column, w.text.split('.')[0]]), [
    [code.indexOf('13px') + 1, 'Unexpected transform translation value "13px"'],
  ]);
  const fixed = await lintCss({ code, fix: true, rules });
  assert.equal(fixed.code, '.a { transform: translateX(var(--space-2, 12px)); }');
  const tokenFix = await lintCss({
    code: ':root { --space-2: 12px; }\n.a { transform: translateX(var(--space-2, 13px)); }',
    fix: true,
    rules: { 'rhythmguard/no-offscale-transform': [true, { fixWith: 'token', scale: SCALE }] },
  });
  assert.equal(tokenFix.code, ':root { --space-2: 12px; }\n.a { transform: translateX(var(--space-2, 12px)); }', 'never the token it falls back from');
});

test('use-scale never fixes a fallback to the token it falls back from', async () => {
  const code = ':root { --space-2: 8px; }\n.a { padding: var(--space-2, 7px); margin: var(--brand-gap, 7px); }';
  const fixed = await lintCss({ code, fix: true, rules: useScale({ fixWith: 'token', tokenPattern: '^--space-' }) });
  assert.equal(fixed.code, ':root { --space-2: 8px; }\n.a { padding: var(--space-2, 8px); margin: var(--brand-gap, var(--space-2)); }');
});

test('prefer-token asks for a token in the fallback of a token var()', async () => {
  const code = ':root { --space-2: 8px; }\n.a { padding: var(--brand-gap, 8px); gap: var(--space-x, var(--space-y, 8px)); }';
  const reported = await lintCss({ code, rules: preferToken() });
  assert.deepEqual(reported.warnings.map((w) => w.text), [
    'Unexpected raw scale value "8px". Use var(--space-2). (rhythmguard/prefer-token)',
    'Unexpected raw scale value "8px". Use var(--space-2). (rhythmguard/prefer-token)',
  ]);
  const fixed = await lintCss({ code, fix: true, rules: preferToken() });
  assert.equal(fixed.code, ':root { --space-2: 8px; }\n.a { padding: var(--brand-gap, var(--space-2)); gap: var(--space-x, var(--space-y, var(--space-2))); }');
});

test('prefer-token accepts a fallback that restates the token it falls back from', async () => {
  const code = ':root { --space-2: 8px; --space-3: 12px; }\n.a { padding: var(--space-2, 8px); margin: var(--space-x, var(--space-2, 8px)); gap: var(--space-2, 12px); }';
  const reported = await lintCss({ code, rules: preferToken() });
  assert.deepEqual(reported.warnings.map((w) => w.text), [
    'Unexpected raw scale value "12px". Use var(--space-3). (rhythmguard/prefer-token)',
  ]);
  const fixed = await lintCss({ code, fix: true, rules: preferToken() });
  assert.equal(fixed.code, ':root { --space-2: 8px; --space-3: 12px; }\n.a { padding: var(--space-2, 8px); margin: var(--space-x, var(--space-2, 8px)); gap: var(--space-2, var(--space-3)); }');
});
