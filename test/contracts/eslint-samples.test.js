'use strict';

/**
 * Every ESLint config sample in the docs, and the one quickstart prints, is
 * run as a whole `eslint.config.js` against a .jsx file and must report the
 * off-scale class (#243). A sample without `files` lints no .jsx at all, and
 * one without JSX parsing fails on the first `<`.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { Linter } = require('eslint');

const { eslintSnippet } = require('../../src/cli/quickstart');

const root = path.join(__dirname, '..', '..');
const pluginUrl = pathToFileURL(path.join(root, 'src', 'eslint', 'index.mjs')).href;

const DOCS = [
  'README.md',
  'packages/eslint-plugin-rhythmguard/README.md',
  'docs/COMPARISON.md',
  'docs/FRAMEWORKS.md',
  'docs/TAILWIND.md',
  'docs/rules/tailwind-class-use-scale.md',
  'docs/rules/tailwind-class-use-motion-scale.md',
];

const JSX = [
  'export const A = () => <div className="p-[13px] duration-[175ms]" />;',
  '',
].join('\n');

function configSamples(markdown) {
  const blocks = [];
  const fence = /```(?:js|javascript)\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(markdown)) !== null) {
    if (/export default/.test(match[1]) && /'rhythmguard-tailwind'/.test(match[1])) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

async function loadConfig(source, name) {
  const rewritten = source.replace(
    /from '(?:eslint-plugin-rhythmguard|stylelint-plugin-rhythmguard\/eslint)'/,
    `from '${pluginUrl}'`,
  );
  assert.notEqual(rewritten, source, `${name} imports the plugin by its published name`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-eslint-sample-'));
  const file = path.join(dir, 'eslint.config.mjs');
  fs.writeFileSync(file, rewritten);
  return (await import(pathToFileURL(file).href)).default;
}

function lintJsx(config) {
  const linter = new Linter({ cwd: root });
  return linter.verify(JSX, config, { filename: path.join(root, 'src', 'page.jsx') });
}

const samples = [];
for (const doc of DOCS) {
  const found = configSamples(fs.readFileSync(path.join(root, doc), 'utf8'));
  found.forEach((source, index) => samples.push({ name: `${doc} sample ${index + 1}`, source }));
}
samples.push({ name: 'quickstart eslintSnippet', source: eslintSnippet([0, 4, 8, 12, 16, 24, 32]) });

test('every documented ESLint sample is found', () => {
  // README 1, package README 2, COMPARISON 1, FRAMEWORKS 1, TAILWIND 1, rule docs 1 + 1, quickstart 1.
  assert.equal(samples.length, 9, samples.map(({ name }) => name).join('\n'));
});

for (const { name, source } of samples) {
  test(`${name} lints JSX class strings`, async () => {
    const config = await loadConfig(source, name);
    const messages = lintJsx(config);
    assert.deepEqual(messages.filter(({ fatal }) => fatal), [], 'the sample parses JSX');
    assert.ok(messages.length >= 1, 'the sample lints the .jsx file and reports the off-scale class');
    for (const message of messages) {
      assert.match(message.ruleId, /^rhythmguard-tailwind\//);
    }
  });
}
