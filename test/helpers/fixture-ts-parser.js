'use strict';

/**
 * A parser that replays typescript-estree ASTs recorded in
 * test/fixtures/ts-class-context/asts.json, so the class-context gate is
 * tested on real TypeScript node shapes (TSLiteralType, TSEnumMember,
 * TSTemplateLiteralType, TSAsExpression) without typescript-eslint, which does
 * not run on the TypeScript 7 this repo builds with. It knows only the
 * recorded sources and throws on any other text, so an unexpected fix fails
 * the test instead of passing silently. Regenerate with generate.mjs there.
 */

const fs = require('node:fs');
const path = require('node:path');
const { KEYS } = require('eslint-visitor-keys');

const DIR = path.join(__dirname, '..', 'fixtures', 'ts-class-context');
const { asts, visitorKeys } = JSON.parse(fs.readFileSync(path.join(DIR, 'asts.json'), 'utf8'));
const KNOWN = Object.keys(asts).map((file) => ({ ast: asts[file], code: fs.readFileSync(path.join(DIR, file), 'utf8'), file }));

function locate(code, offset) {
  const before = code.slice(0, offset);
  const line = before.split('\n').length;
  return { column: offset - (before.lastIndexOf('\n') + 1), line };
}

function withLocations(value, code) {
  if (Array.isArray(value)) {
    value.forEach((child) => withLocations(child, code));
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value.range) && typeof value.range[0] === 'number') {
      value.loc = { end: locate(code, value.range[1]), start: locate(code, value.range[0]) };
    }
    Object.values(value).forEach((child) => withLocations(child, code));
  }
  return value;
}

const fixtureTsParser = {
  meta: { name: 'fixture-ts-parser' },
  parseForESLint(code) {
    const known = KNOWN.find((entry) => entry.code === code);
    if (!known) {
      throw new Error('fixture-ts-parser: no recorded AST for this source; run test/fixtures/ts-class-context/generate.mjs');
    }
    const ast = withLocations(JSON.parse(JSON.stringify(known.ast)), code);
    return { ast, visitorKeys: { ...KEYS, ...visitorKeys } };
  },
};

module.exports = { fixtureTsParser, fixtureTsSource: (file) => fs.readFileSync(path.join(DIR, file), 'utf8') };
