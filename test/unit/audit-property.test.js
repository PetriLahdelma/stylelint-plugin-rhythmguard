'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { findDeclarationProperty } = require('../../src/audit/scan/stylesheets');

test('findDeclarationProperty returns the property of the declaration at a warning position', () => {
  const source = [
    '.card {',
    '  padding: 13px;',
    '  margin-bottom: 7px;',
    '}',
  ].join('\n');

  assert.equal(findDeclarationProperty(source, 2, 12), 'padding');
  assert.equal(findDeclarationProperty(source, 3, 18), 'margin-bottom');
});

test('findDeclarationProperty follows a value that spans several lines', () => {
  const source = [
    '.grid {',
    '  margin:',
    '    4px',
    '    13px;',
    '}',
  ].join('\n');

  assert.equal(findDeclarationProperty(source, 4, 5), 'margin');
});

test('findDeclarationProperty is not fooled by a pseudo-class colon in the selector', () => {
  const source = 'a:hover { gap: 13px; }';

  assert.equal(findDeclarationProperty(source, 1, 16), 'gap');
});

test('findDeclarationProperty reads the first declaration after an opening brace on the same line', () => {
  const source = '.row { column-gap: 13px }';

  assert.equal(findDeclarationProperty(source, 1, 20), 'column-gap');
});

test('findDeclarationProperty skips Sass line comments and block comments before the declaration', () => {
  const source = [
    '.button {',
    '  margin-top: 8px;',
    '',
    '  // Padding prevents focus outlines from being cut off',
    '  margin-inline-start: -2px;',
    '  /* hairline */ padding: 13px;',
    '}',
  ].join('\n');

  assert.equal(findDeclarationProperty(source, 5, 24), 'margin-inline-start');
  assert.equal(findDeclarationProperty(source, 6, 27), 'padding');
});

test('findDeclarationProperty returns null when the position is not inside a declaration', () => {
  const source = [
    '.x {',
    '  @include spacing(13px);',
    '}',
  ].join('\n');

  assert.equal(findDeclarationProperty(source, 2, 20), null);
  assert.equal(findDeclarationProperty(source, 9, 1), null);
});
