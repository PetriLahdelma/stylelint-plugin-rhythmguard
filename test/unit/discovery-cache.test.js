'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverTokenPackages } = require('../../src/core/scale-inference');

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

test('every token-package allowlist entry names files and compiles its pattern', () => {
  const { packages } = require('../../src/core/token-packages.json');
  const names = new Set();
  for (const entry of packages) {
    assert.ok(!names.has(entry.name), `${entry.name} listed once`);
    names.add(entry.name);
    assert.ok(Array.isArray(entry.files) && entry.files.length > 0, `${entry.name} lists files`);
    for (const file of entry.files) assert.match(file, /\.(?:css|scss)$/, `${entry.name}: ${file} is a stylesheet`);
    if (entry.tokenPattern) assert.doesNotThrow(() => new RegExp(entry.tokenPattern), `${entry.name} pattern compiles`);
    assert.ok(entry.note, `${entry.name} says what it carries`);
  }
});

test('a project that depends on bootstrap inherits its $spacers map as the scale', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-discovery-bootstrap-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'bootstrap', 'scss'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","dependencies":{"bootstrap":"^5.3.0"}}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'bootstrap', 'package.json'), '{"name":"bootstrap"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'bootstrap', 'scss', '_variables.scss'), [
    '$spacer: 1rem !default;',
    '$spacers: (',
    '  0: 0,',
    '  1: $spacer * .25,',
    '  2: $spacer * .5,',
    '  3: $spacer,',
    '  4: $spacer * 1.5,',
    '  5: $spacer * 3,',
    ') !default;',
    '$dropdown-spacer: .125rem !default;',
    '',
  ].join('\n'));

  const sources = discoverTokenPackages(dir);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].package, 'bootstrap');
  const { parseTokenSources } = require('../../src/core/token-sources');
  const { scaleFromDefinitions } = require('../../src/core/scale-inference');
  const parsed = parseTokenSources({ baseFontSize: 16, sources, tokenKind: 'spacing' });
  assert.deepEqual(scaleFromDefinitions(parsed.definitions, 16), [0, 4, 8, 16, 24, 48]);
});
