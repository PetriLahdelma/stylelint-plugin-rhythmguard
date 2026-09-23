'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { findStringLiterals } = require('../../src/audit/scan/templates');

const values = (source) => findStringLiterals(source).map((literal) => literal.value);

test('findStringLiterals reads single, double and backtick literals with escapes and positions', () => {
  const source = 'const a = "p-[13px] x"; const b = \'it\\\'s m-2\'; const c = `gap-[7px]\n${x}`;';
  const literals = findStringLiterals(source);
  assert.deepEqual(literals.map((l) => [l.quote, l.value]), [
    ['"', 'p-[13px] x'],
    ["'", "it\\'s m-2"],
    ['`', 'gap-[7px]\n${x}'],
  ]);
  assert.equal(source.slice(literals[0].valueStart, literals[0].valueStart + literals[0].value.length), 'p-[13px] x');
});

test('findStringLiterals treats a quote that reaches the end of its line as no literal at all', () => {
  assert.deepEqual(values("// don't\nconst a = 'p-[13px]';\n"), ['p-[13px]']);
  assert.deepEqual(values('const a = "m-[5px]"; // "\nconst b = "p-2";'), ['m-[5px]', 'p-2']);
});

test('findStringLiterals is linear on escape-dense source with an unclosed quote (Ace mode-alda.js hung the audit for hours)', () => {
  // A regex literal full of \{ \[ \( after an unmatched quote: the previous
  // regex-based finder backtracked exponentially over the backslashes.
  const source = `x = ' + /${'\\{\\[\\('.repeat(30)}/;\n` + `const ok = 'gap-2';\n`;
  const started = Date.now();
  const literals = values(source);
  assert.ok(Date.now() - started < 1000, 'must finish immediately');
  assert.deepEqual(literals, ['gap-2']);
});
