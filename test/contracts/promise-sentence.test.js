'use strict';

/**
 * One promise sentence, byte-identical on eight surfaces (pos-08): the root
 * README, the two package READMEs, the three package.json descriptions,
 * docs/FOR_AGENTS.md and the playground's meta description. docs/DISTRIBUTION.md
 * records it as the GitHub about text, which is set by hand outside the
 * repository. Change the sentence here and on every surface in one commit.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PROMISE = 'Nobody chose 13px; Rhythmguard reads the spacing scale from your design tokens, reports off-scale spacing in CSS, SCSS and Tailwind class strings with the two nearest steps, and fails CI only on new drift.';

/** The first paragraph after the first `# ` heading of a Markdown file. */
function firstParagraph(file) {
  const lines = read(file).split('\n');
  const heading = lines.findIndex((line) => line.startsWith('# '));
  assert.ok(heading > -1, `${file} has a title`);
  const start = lines.findIndex((line, index) => index > heading && line.trim() !== '');
  return lines[start];
}

const SURFACES = [
  ['README.md', () => firstParagraph('README.md')],
  ['packages/eslint-plugin-rhythmguard/README.md', () => firstParagraph('packages/eslint-plugin-rhythmguard/README.md')],
  ['packages/rhythmguard/README.md', () => firstParagraph('packages/rhythmguard/README.md')],
  ['docs/FOR_AGENTS.md', () => firstParagraph('docs/FOR_AGENTS.md')],
  ['docs/index.html meta description', () => read('docs/index.html').match(/<meta name="description" content="([^"]*)"/)[1]],
  ...['package.json', 'packages/eslint-plugin-rhythmguard/package.json', 'packages/rhythmguard/package.json'].map((file) => [
    `${file} description`,
    () => JSON.parse(read(file)).description.slice(0, PROMISE.length),
  ]),
];

test('the promise sentence is one sentence, fits the GitHub about field and has no em dash', () => {
  assert.equal(PROMISE.split(/[.!?](?:\s|$)/).filter(Boolean).length, 1);
  assert.ok(PROMISE.length <= 350, 'GitHub limits the about text to 350 characters');
  assert.ok(!PROMISE.includes(String.fromCharCode(0x2014)));
});

test('eight surfaces carry the promise sentence byte for byte', () => {
  assert.equal(SURFACES.length, 8);
  for (const [name, get] of SURFACES) {
    assert.equal(get(), PROMISE, name);
  }
});

test('each package.json description continues after the sentence', () => {
  for (const file of ['package.json', 'packages/eslint-plugin-rhythmguard/package.json', 'packages/rhythmguard/package.json']) {
    const { description } = JSON.parse(read(file));
    assert.ok(description.startsWith(`${PROMISE} `), file);
  }
});

test('docs/DISTRIBUTION.md records the sentence as the GitHub about text', () => {
  const row = read('docs/DISTRIBUTION.md').split('\n').find((line) => line.startsWith('| GitHub about |'));
  assert.ok(row && row.includes(`"${PROMISE}"`), row);
});

test('npm descriptions and keywords name the token formats and hosts people search for (dc-05)', () => {
  for (const file of ['package.json', 'packages/eslint-plugin-rhythmguard/package.json', 'packages/rhythmguard/package.json']) {
    const { description, keywords } = JSON.parse(read(file));
    for (const term of ['DTCG', 'Style Dictionary', '@theme', 'Sass', 'Tailwind v4', 'Oxlint']) {
      assert.ok(description.includes(term), `${file} description names ${term}`);
    }
    for (const keyword of ['dtcg', 'style-dictionary', 'tailwind-v4', 'oxlint', 'design-tokens']) {
      assert.ok(keywords.includes(keyword), `${file} keywords include ${keyword}`);
    }
  }
});
