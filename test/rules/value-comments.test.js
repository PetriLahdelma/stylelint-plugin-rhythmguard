'use strict';

// Issue #233: PostCSS strips comments from `decl.value` and keeps the value as
// written in `raws.value.raw`. Positions and fixes are computed against the
// value as written, so a comment survives the fix and the warning points at
// the literal.

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const SCALE = [0, 4, 8, 12, 16, 24];
const useScale = (extra = {}) => ({ 'rhythmguard/use-scale': [true, { scale: SCALE, ...extra }] });
const preferToken = (extra = {}) => ({ 'rhythmguard/prefer-token': [true, extra] });

test('use-scale points at a literal after a comment and keeps the comment when it fixes', async () => {
  const code = '.a { padding: 8px /* keep */ 13px; }';
  const reported = await lintCss({ code, rules: useScale() });
  assert.equal(reported.warnings.length, 1);
  assert.equal(reported.warnings[0].column, code.indexOf('13px') + 1);
  assert.equal(reported.warnings[0].endColumn, code.indexOf('13px') + 1 + '13px'.length);
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { padding: 8px /* keep */ 12px; }');
});

test('use-scale keeps a comment inside a math function it fixes', async () => {
  const code = '.a { padding: clamp(13px /*a*/, 2vw, 24px); }';
  const fixed = await lintCss({ code, fix: true, rules: useScale({ checkMathBounds: true }) });
  assert.equal(fixed.code, '.a { padding: clamp(12px /*a*/, 2vw, 24px); }');
});

test('use-scale keeps comments on both sides of several fixed literals', async () => {
  const code = '.a { margin: /* top */ 13px /* x */ 7px 9px; }';
  const reported = await lintCss({ code, rules: useScale() });
  assert.deepEqual(reported.warnings.map((w) => w.column), [
    code.indexOf('13px') + 1,
    code.indexOf('7px') + 1,
    code.indexOf('9px') + 1,
  ]);
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { margin: /* top */ 12px /* x */ 8px 8px; }');
});

test('use-scale leaves a commented value untouched when nothing is fixed', async () => {
  const code = '.a { padding: 8px /* keep */ 12px; }';
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.deepEqual(fixed.warnings, []);
  assert.equal(fixed.code, code);
});

test('prefer-token points at a literal after a comment and keeps the comment when it fixes', async () => {
  const code = ':root { --space-2: 8px; }\n.a { padding: 4px /* k */ 8px; }';
  const reported = await lintCss({ code, rules: preferToken() });
  const line = code.split('\n')[1];
  assert.deepEqual(reported.warnings.map((w) => w.column), [line.indexOf('4px') + 1, line.indexOf('8px') + 1]);
  const fixed = await lintCss({ code, fix: true, rules: preferToken() });
  assert.equal(fixed.code, ':root { --space-2: 8px; }\n.a { padding: 4px /* k */ var(--space-2); }');
});

test('use-scale keeps a block comment in a Sass value and points at the literal', async () => {
  const code = '.a { padding: 8px /* keep */ 13px; }';
  const reported = await lintCss({ code, customSyntax: 'postcss-scss', rules: useScale() });
  assert.equal(reported.warnings[0].column, code.indexOf('13px') + 1);
  const fixed = await lintCss({ code, customSyntax: 'postcss-scss', fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { padding: 8px /* keep */ 12px; }');
});

test('use-scale keeps a Sass inline comment, ignores lengths inside it and points at the literal on the next line', async () => {
  const code = '.a {\n  padding: 8px // was 13px\n    13px;\n}';
  const reported = await lintCss({ code, customSyntax: 'postcss-scss', rules: useScale() });
  assert.equal(reported.warnings.length, 1);
  assert.equal(reported.warnings[0].line, 3);
  assert.equal(reported.warnings[0].column, 5);
  const fixed = await lintCss({ code, customSyntax: 'postcss-scss', fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a {\n  padding: 8px // was 13px\n    12px;\n}');
});

test('use-scale keeps a comment in an evaluated Sass value and points at the term', async () => {
  const code = '$gap: 2;\n.a { margin: $gap * 6px /* c */ 13px; }';
  const reported = await lintCss({ code, customSyntax: 'postcss-scss', rules: useScale() });
  const line = code.split('\n')[1];
  assert.deepEqual(reported.warnings.map((w) => w.column), [line.indexOf('13px') + 1]);
  const fixed = await lintCss({ code, customSyntax: 'postcss-scss', fix: true, rules: useScale() });
  assert.equal(fixed.code, '$gap: 2;\n.a { margin: $gap * 6px /* c */ 12px; }');
});

test('a comment that PostCSS keeps in the value is still kept by the fix', async () => {
  const code = '.a { padding: 8px/* keep */13px; }';
  const fixed = await lintCss({ code, fix: true, rules: useScale() });
  assert.equal(fixed.code, '.a { padding: 8px/* keep */12px; }');
});

test('no-offscale-transform and use-motion-scale keep a comment in the value they fix', async () => {
  const transform = await lintCss({
    code: '.a { transform: translateX(13px) /* nudge */ translateY(7px); }',
    fix: true,
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: SCALE }] },
  });
  assert.equal(transform.code, '.a { transform: translateX(12px) /* nudge */ translateY(8px); }');
  const motion = await lintCss({
    code: '.a { transition: opacity 175ms /* quick */ ease-out; }',
    fix: true,
    rules: { 'rhythmguard/use-motion-scale': true },
  });
  assert.equal(motion.code, '.a { transition: opacity 150ms /* quick */ ease-out; }');
});
