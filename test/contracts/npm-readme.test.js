'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const load = () => import(pathToFileURL(path.join(root, 'scripts', 'ci', 'npm-readme.mjs')).href);

test('the npm README swaps only the banner: SVG on GitHub, the non-transparent PNG on npmjs.com, same cache key', async () => {
  const { toNpmReadme } = await load();
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const npm = toNpmReadme(readme);
  const key = readme.match(/rhythmguard-banner\.svg(\?v=\d+)/)[1];
  assert.ok(npm.includes(`assets/rhythmguard-banner.png${key}`));
  assert.ok(!npm.includes('rhythmguard-banner.svg'));
  const changed = readme.split('\n').filter((line, i) => line !== npm.split('\n')[i]);
  assert.equal(changed.length, 1, 'exactly one line differs');
  assert.ok(fs.existsSync(path.join(root, 'assets', 'rhythmguard-banner.png')), 'the PNG the npm README points at is committed');
  assert.throws(() => toNpmReadme('no banner here'), /found 0/);
});

test('the release job rewrites the README before it publishes', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const rewrite = workflow.indexOf('node scripts/ci/npm-readme.mjs');
  const publish = workflow.indexOf('npm publish --access public --registry https://registry.npmjs.org');
  assert.ok(rewrite > -1 && publish > rewrite, 'npm-readme runs before the main package publish');
});
