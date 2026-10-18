'use strict';

// Issue #233: rules read and write the value as written, so comments survive a
// fix and offsets point into the source.

const assert = require('node:assert/strict');
const test = require('node:test');
const postcss = require('postcss');
const postcssScss = require('postcss-scss');
const valueParser = require('postcss-value-parser');

const { declarationValueIndex, declarationValueSource, writeDeclarationValue } = require('../../src/core/value-nodes');

function firstDecl(root) {
  let found = null;
  root.walkDecls((decl) => {
    found = found || decl;
  });
  return found;
}

function replaceWord(decl, from, to) {
  const source = declarationValueSource(decl);
  const parsed = valueParser(source.parseText);
  parsed.walk((node) => {
    if (node.type === 'word' && node.value === from) node.value = to;
  });
  return writeDeclarationValue(decl, source, parsed);
}

test('declarationValueSource reads the written value and offsets point into it', () => {
  const root = postcss.parse('.a { padding: 8px /* keep */ 13px; }');
  const decl = firstDecl(root);
  const source = declarationValueSource(decl);
  assert.equal(source.text, '8px /* keep */ 13px');
  assert.equal(declarationValueIndex(decl), 'padding: '.length);
  assert.equal(replaceWord(decl, '13px', '12px'), true);
  assert.equal(root.toString(), '.a { padding: 8px /* keep */ 12px; }');
  assert.equal(decl.value, '8px  12px', 'decl.value stays the value without comments');
});

test('writeDeclarationValue changes nothing when no node changed', () => {
  const root = postcss.parse('.a { padding: 8px /* keep */ 13px; }');
  const decl = firstDecl(root);
  const source = declarationValueSource(decl);
  assert.equal(writeDeclarationValue(decl, source, valueParser(source.parseText)), false);
  assert.equal(root.toString(), '.a { padding: 8px /* keep */ 13px; }');
});

test('Sass inline comments are blanked for parsing and kept, escapes included, when writing', () => {
  const code = '.a {\n  margin: 7px // a */ b 13px\n    13px // c\n    9px;\n}';
  const root = postcssScss.parse(code);
  const decl = firstDecl(root);
  const source = declarationValueSource(decl);
  assert.equal(source.text.length, source.parseText.length);
  const words = valueParser(source.parseText).nodes.filter((node) => node.type === 'word').map((node) => node.value);
  assert.deepEqual(words, ['7px', '13px', '9px'], 'nothing inside a // comment is a value');
  replaceWord(decl, '7px', '8px');
  replaceWord(decl, '13px', '12.5px');
  assert.equal(root.toString(postcssScss.stringify), '.a {\n  margin: 8px // a */ b 13px\n    12.5px // c\n    9px;\n}');
});
