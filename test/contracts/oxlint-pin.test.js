'use strict';

/**
 * Oxlint is pinned in one place, the CI job "oxlint companion rules", and the
 * docs name the version CI tests. Bumping the pin is a release step
 * (docs/RELEASE_CHECKLIST.md); this test fails until every doc names the new
 * version and keeps the alpha and `<script>`-only caveats (eb-10).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const DOCS = [
  'README.md',
  'packages/eslint-plugin-rhythmguard/README.md',
  'docs/TAILWIND.md',
  'docs/rules/tailwind-class-use-scale.md',
];

function ciPin() {
  const workflow = read('.github/workflows/ci.yml');
  const installs = [...workflow.matchAll(/oxlint@(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
  assert.equal(new Set(installs).size, 1, `one pinned Oxlint version in ci.yml: ${installs.join(', ')}`);
  const pin = installs[0];
  assert.ok(workflow.includes(`oxlint-${pin}`), 'the job name carries the pin');
  return pin;
}

test('every doc that names an Oxlint version names the CI pin', () => {
  const pin = ciPin();
  for (const doc of DOCS) {
    const versions = [...read(doc).matchAll(/Oxlint (\d+\.\d+\.\d+)/g)].map((match) => match[1]);
    assert.ok(versions.length > 0, `${doc} names the Oxlint version CI tests`);
    assert.deepEqual([...new Set(versions)], [pin], doc);
  }
});

test('every doc that names the pin states the Oxlint caveats', () => {
  for (const doc of DOCS) {
    const text = read(doc);
    assert.match(text, /Oxlint's JS plugins are alpha/, doc);
    assert.match(text, /in Vue, Svelte and Astro files Oxlint lints only the `<script>` blocks/, doc);
  }
});
