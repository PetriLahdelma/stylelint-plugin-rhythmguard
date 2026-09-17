'use strict';

/**
 * eslint-plugin-rhythmguard is a name, not a second implementation: it must
 * re-export the exact plugin object of stylelint-plugin-rhythmguard/eslint,
 * carry the same version, and depend on that version.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const packageDir = path.join(root, 'packages', 'eslint-plugin-rhythmguard');

function linkedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-eslint-pkg-'));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.symlinkSync(root, path.join(dir, 'node_modules', 'stylelint-plugin-rhythmguard'), 'dir');
  // Copied, not linked: Node resolves a symlinked file to its real path and would
  // look for stylelint-plugin-rhythmguard from packages/, where it is not installed.
  fs.cpSync(packageDir, path.join(dir, 'node_modules', 'eslint-plugin-rhythmguard'), { recursive: true });
  return dir;
}

test('eslint-plugin-rhythmguard re-exports the same plugin object (CommonJS)', () => {
  const dir = linkedProject();
  const viaPackage = require(path.join(dir, 'node_modules', 'eslint-plugin-rhythmguard'));
  const direct = require(path.join(root, 'src', 'eslint', 'index.js'));
  assert.equal(viaPackage, direct);
  assert.deepEqual(Object.keys(viaPackage.rules), ['tailwind-class-use-scale', 'tailwind-class-use-motion-scale']);
});

test('eslint-plugin-rhythmguard re-exports the same plugin object (ESM)', async () => {
  const dir = linkedProject();
  const { pathToFileURL } = require('node:url');
  const entry = path.join(dir, 'node_modules', 'eslint-plugin-rhythmguard', 'index.mjs');
  const mod = await import(pathToFileURL(entry).href);
  const direct = require(path.join(root, 'src', 'eslint', 'index.js'));
  assert.equal(mod.default, direct);
  assert.equal(mod.rules, direct.rules);
  assert.equal(mod.configs, direct.configs);
});

test('eslint-plugin-rhythmguard shares the version of stylelint-plugin-rhythmguard and depends on it', () => {
  const main = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  assert.equal(pkg.version, main.version, 'bump both package.json files in a release');
  assert.equal(pkg.dependencies['stylelint-plugin-rhythmguard'], `^${main.version}`);
  assert.deepEqual(pkg.files.sort(), ['LICENSE', 'README.md', 'index.d.ts', 'index.js', 'index.mjs']);
});
