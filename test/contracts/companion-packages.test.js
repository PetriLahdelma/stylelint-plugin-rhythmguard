'use strict';

/**
 * The companion packages are names, not second implementations.
 * eslint-plugin-rhythmguard must re-export the exact plugin object of
 * stylelint-plugin-rhythmguard/eslint; rhythmguard must run the same CLI.
 * Both carry the main package's version and depend on that version.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const COMPANIONS = ['eslint-plugin-rhythmguard', 'rhythmguard'];

function linkedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-companions-'));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.symlinkSync(root, path.join(dir, 'node_modules', 'stylelint-plugin-rhythmguard'), 'dir');
  // Copied, not linked: Node resolves a symlinked file to its real path and would
  // look for stylelint-plugin-rhythmguard from packages/, where it is not installed.
  for (const name of COMPANIONS) {
    fs.cpSync(path.join(root, 'packages', name), path.join(dir, 'node_modules', name), { recursive: true });
  }
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

test('the rhythmguard package runs the same CLI', () => {
  const { execFileSync } = require('node:child_process');
  const dir = linkedProject();
  const bin = path.join(dir, 'node_modules', 'rhythmguard', 'bin.js');
  const viaPackage = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  const direct = execFileSync(process.execPath, [path.join(root, 'src', 'cli', 'index.js'), '--help'], { encoding: 'utf8' });
  assert.equal(viaPackage, direct);
  assert.match(viaPackage, /^Usage: rhythmguard \[command\]/);
});

test('companion packages share the version of stylelint-plugin-rhythmguard and depend on it', () => {
  const main = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const name of COMPANIONS) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'));
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, main.version, `${name}: bump every package.json in a release`);
    assert.equal(pkg.dependencies['stylelint-plugin-rhythmguard'], `^${main.version}`, `${name} depends on the released version`);
    assert.ok(pkg.files.includes('README.md') && pkg.files.includes('LICENSE'), `${name} publishes README and LICENSE`);
    assert.equal(pkg.publishConfig.provenance, true, `${name} publishes with provenance`);
  }
});
