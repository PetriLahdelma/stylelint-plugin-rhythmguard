'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverTokenPackages } = require('../src/core/scale-inference');

function countReads(run) {
  const original = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = (...args) => {
    reads += 1;
    return original.apply(fs, args);
  };
  try {
    run();
  } finally {
    fs.readFileSync = original;
  }
  return reads;
}

test('token-package discovery reads the filesystem once per cwd until a consulted file changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-discovery-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'tailwindcss'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","devDependencies":{"tailwindcss":"^4.1.0"}}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'theme.css'), '@theme { --spacing: 0.25rem; }');

  const first = discoverTokenPackages(dir);
  assert.equal(first.length, 1);
  assert.equal(countReads(() => assert.equal(discoverTokenPackages(dir), first)), 0, 'second call is served from the cache');

  const later = new Date(Date.now() + 5000);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","devDependencies":{}}');
  fs.utimesSync(path.join(dir, 'package.json'), later, later);
  assert.ok(countReads(() => assert.equal(discoverTokenPackages(dir).length, 0)) > 0, 'a changed package.json invalidates the entry');
});
