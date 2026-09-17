'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const rule = (extra = {}) => ({ 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16, 24], ...extra }] });
const scss = (code, extra, fix = false) => lintCss({ code, customSyntax: 'postcss-scss', fix, rules: rule(extra) });

test('use-scale evaluates a Sass expression over a spacing variable and reports it off scale, without a fix', async () => {
  const result = await scss('$spacer: 1rem;\n.a { padding: $spacer * .3; }', {}, true);
  assert.deepEqual(result.warnings.map((w) => w.text), [
    'Unexpected off-scale value "$spacer * .3". Use scale values (nearest: 4px or 8px). Evaluates to 4.8px. (rhythmguard/use-scale)',
  ]);
  assert.equal(result.code, '$spacer: 1rem;\n.a { padding: $spacer * .3; }', 'an expression is never rewritten');
});

test('use-scale accepts Sass expressions that land on the scale, including math.div()', async () => {
  const result = await scss('@use "sass:math";\n$spacer: 1rem;\n.a { padding: $spacer * .5; margin: math.div($spacer, 2); gap: -$spacer; }');
  assert.deepEqual(result.warnings, []);
});

test('use-scale checks each term of a space-separated Sass value and points at the term', async () => {
  const result = await scss('$spacer: 1rem;\n.a { padding: $spacer * .3 $spacer; }');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /"\$spacer \* \.3"/);
  assert.equal(result.warnings[0].line, 2);
  assert.equal(result.warnings[0].column, '.a { padding: '.length + 1);
});

test('use-scale leaves Sass expressions it cannot resolve alone', async () => {
  const result = await scss('.a { padding: $gutter * .3; margin: math.div($unknown, 2); }');
  assert.deepEqual(result.warnings, []);
});

test('use-scale resolves Sass variables declared in a scaleSources file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-sass-'));
  fs.writeFileSync(path.join(dir, '_variables.scss'), '$spacer: 1rem !default;\n');
  const result = await scss('.a { margin-top: $spacer * .3; }', { scaleSources: [path.join(dir, '_variables.scss')] });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /Evaluates to 4\.8px\./);
});

test('use-scale applies the hairline allowance to an evaluated Sass expression', async () => {
  const result = await scss('$spacer: 1rem;\n.a { margin-top: $spacer * .0625; }');
  assert.deepEqual(result.warnings, []);
});

test('use-scale still checks and fixes literals next to a Sass term it cannot resolve', async () => {
  const code = '.a { padding: 13px $gutter; margin: 0 #{$x} 7px; }';
  const reported = await scss(code);
  assert.deepEqual(reported.warnings.map((w) => w.text.split('.')[0]), [
    'Unexpected off-scale value "13px"',
    'Unexpected off-scale value "7px"',
  ]);
  const fixed = await scss(code, {}, true);
  assert.equal(fixed.code, '.a { padding: 12px $gutter; margin: 0 #{$x} 8px; }');
});

test('use-scale fixes a literal term of a fully evaluated Sass value and only reports the expression', async () => {
  const code = '$spacer: 1rem;\n.a { padding: 13px $spacer * .3; }';
  const reported = await scss(code);
  const byColumn = [...reported.warnings].sort((a, b) => a.column - b.column);
  assert.deepEqual(byColumn.map((w) => w.text.split('.')[0]), [
    'Unexpected off-scale value "13px"',
    'Unexpected off-scale value "$spacer * ',
  ]);
  const fixed = await scss(code, {}, true);
  assert.equal(fixed.code, '$spacer: 1rem;\n.a { padding: 12px $spacer * .3; }');
});
