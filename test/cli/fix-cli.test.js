'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-fix-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { margin: 10px; padding: 10px 15px; }\n');
  fs.writeFileSync(path.join(dir, 'src', 'b.scss'), '.b { gap: 0.625rem; }\n');
  return dir;
}

function runFix(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, 'fix', ...args], { cwd, encoding: 'utf8' });
}

test('fix is a dry run by default: it lists every change and writes nothing', () => {
  const dir = fixture();
  const result = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /src\/a\.css:1:14\s+margin: 10px -> var\(--space-sm\)/);
  assert.match(result.stdout, /src\/b\.scss:1:11\s+gap: 0\.625rem -> var\(--space-sm\)/);
  assert.match(result.stdout, /3 replacements in 2 files \(dry run; pass --write to apply\)/);
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), '.a { margin: 10px; padding: 10px 15px; }\n');
});

test('fix --write applies the replacement and touches only the files it changed', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'src', 'c.css'), '.c { margin: 8px; }\n');
  const before = fs.statSync(path.join(dir, 'src', 'c.css')).mtimeMs;
  const result = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)', '--write');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 replacements in 2 files/);
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), '.a { margin: var(--space-sm); padding: var(--space-sm) 15px; }\n');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'b.scss'), 'utf8'), '.b { gap: var(--space-sm); }\n');
  assert.equal(fs.statSync(path.join(dir, 'src', 'c.css')).mtimeMs, before, 'an untouched file is not rewritten');

  const again = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)', '--write');
  assert.match(again.stdout, /0 replacements/, 'idempotent');
});

test('fix --decided executes every snap decision that names its target', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    decisions: [
      { value: '10px', decision: 'snap', to: '8px' },
      { value: '15px', decision: 'snap' },
      { value: '2px', decision: 'allow' },
    ],
  }));
  const result = runFix(dir, 'src', '--decided');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /margin: 10px -> 8px/);
  assert.match(result.stdout, /1 snap decision has no "to" and was skipped: 15px/);
  assert.doesNotMatch(result.stdout, /15px ->/);
});

test('fix refuses an unparsable value or a missing target', () => {
  const dir = fixture();
  assert.equal(runFix(dir, 'src', '--value', 'lots', '--to', '8px').status, 1);
  const missing = runFix(dir, 'src', '--value', '10px');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--to/);
});
