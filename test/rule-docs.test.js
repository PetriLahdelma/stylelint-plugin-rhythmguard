'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const plugin = require('../src/index');

const DOCS_URL_PREFIX =
  'https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/rules/';

function docPathFromUrl(url) {
  assert.ok(url && url.startsWith(DOCS_URL_PREFIX), `rule doc url must live under docs/rules/: ${url}`);
  return path.join(__dirname, '..', 'docs', 'rules', url.slice(DOCS_URL_PREFIX.length));
}

function assertRuleDoc(ruleName, url) {
  const docPath = docPathFromUrl(url);
  assert.equal(fs.existsSync(docPath), true, `missing rule doc ${docPath} for ${ruleName}`);
  const doc = fs.readFileSync(docPath, 'utf8');
  assert.match(doc, new RegExp(`^# \`${ruleName.replace(/[/-]/g, '\\$&')}\``, 'm'), `${docPath} must start with the rule name heading`);
  assert.match(doc, /^## Options/m, `${docPath} must have an Options section`);
  assert.match(doc, /^## Examples/m, `${docPath} must have an Examples section`);
  assert.match(doc, /❌|✅/, `${docPath} must show passing and failing examples`);
}

test('every Stylelint rule points meta.url at its own docs/rules page', () => {
  for (const [ruleName, rule] of Object.entries(plugin.rules)) {
    assertRuleDoc(ruleName, rule.meta && rule.meta.url);
  }
});

test('every ESLint companion rule points meta.docs.url at its own docs/rules page', () => {
  for (const [shortName, rule] of Object.entries(plugin.eslint.rules)) {
    const url = rule.meta && rule.meta.docs && rule.meta.docs.url;
    assertRuleDoc(`rhythmguard-tailwind/${shortName}`, url);
  }
});

test('docs/rules has no orphan pages', () => {
  const linked = new Set([
    ...Object.values(plugin.rules).map((rule) => rule.meta.url),
    ...Object.values(plugin.eslint.rules).map((rule) => rule.meta.docs && rule.meta.docs.url),
  ].filter(Boolean).map((url) => url.slice(DOCS_URL_PREFIX.length)));
  const files = fs.readdirSync(path.join(__dirname, '..', 'docs', 'rules')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.deepEqual(files.sort(), [...linked].sort());
});
