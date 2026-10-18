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

test('findStringLiterals also reads quoted literals nested inside an outer literal (#254)', () => {
  const jsx = "<div className={`flex ${on ? 'p-[13px]' : 'm-[15px]'}`} />";
  assert.deepEqual(values(jsx), ["flex ${on ? 'p-[13px]' : 'm-[15px]'}", 'p-[13px]', 'm-[15px]']);

  const vue = `<div :class="{ 'p-[13px]': active }" /><div :class="[active ? 'px-[13px]' : '']" />`;
  assert.deepEqual(values(vue), ["{ 'p-[13px]': active }", 'p-[13px]', "[active ? 'px-[13px]' : '']", 'px-[13px]', '']);

  const svelte = `<div class="m-[15px] {on ? 'gap-[13px]' : ''}"></div>`;
  assert.deepEqual(values(svelte), ["m-[15px] {on ? 'gap-[13px]' : ''}", 'gap-[13px]', '']);

  // Offsets of nested literals point into the original source.
  const nested = findStringLiterals(jsx).find((literal) => literal.value === 'm-[15px]');
  assert.equal(jsx.slice(nested.valueStart, nested.valueStart + nested.value.length), 'm-[15px]');
});

test('findStringLiterals never reads the enclosing quote as a nested literal', () => {
  // An escaped outer quote inside the literal opens nothing.
  assert.deepEqual(values('const a = "say \\"p-[13px]\\" now";'), ['say \\"p-[13px]\\" now']);
  // Three levels: double, single, backtick.
  assert.deepEqual(values('x = "a \'b `c` d\' e";'), ["a 'b `c` d' e", 'b `c` d', 'c']);
});

test('findStringLiterals stays linear on deeply nested, escape-dense input', () => {
  const inner = `'${'\\{\\[\\('.repeat(20)} p-[13px] "x" ' `;
  const source = `const a = \`${inner.repeat(20000)}\`;\nconst ok = 'gap-2';\n`;
  const started = Date.now();
  const literals = values(source);
  assert.ok(Date.now() - started < 2000, 'must finish quickly');
  assert.equal(literals.at(-1), 'gap-2');
  assert.equal(literals.length, 1 + 20000 * 2 + 1);
});
