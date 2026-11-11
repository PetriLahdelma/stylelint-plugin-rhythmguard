'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function rhythmguard(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-scale-'));
  fs.mkdirSync(path.join(dir, 'tokens'));
  fs.mkdirSync(path.join(dir, 'src'));
  const step = (value) => ({ $type: 'dimension', $value: value });
  fs.writeFileSync(path.join(dir, 'tokens', 'tokens.json'), JSON.stringify({
    space: { 1: step('4px'), 2: step('8px'), 3: step('12px'), 4: step('16px'), 6: step('24px') },
  }));
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { padding: 13px; }\n');
  return dir;
}

test('rhythmguard scale prints the scale the audit uses, its source and the token per step', () => {
  const dir = project();
  const args = ['--scale', 'auto', '--token-source', './tokens/tokens.json'];
  const scale = rhythmguard(dir, 'scale', '.', ...args, '--format', 'json');
  assert.equal(scale.status, 0, scale.stderr);
  const report = JSON.parse(scale.stdout);

  const audit = JSON.parse(rhythmguard(dir, 'audit', '.', ...args, '--format', 'json').stdout);
  assert.deepEqual(report.scale.values, audit.contracts.scale.values, 'the same scale as the audit');
  assert.equal(report.scale.source, audit.contracts.scale.source);
  assert.equal(report.scale.source, 'token-sources');
  assert.deepEqual(report.scale.files, ['tokens/tokens.json']);
  assert.equal(report.schemaVersion, '1.0');

  const twelve = report.steps.find((step) => step.value === 12);
  assert.deepEqual(twelve.tokens, [{ file: 'tokens/tokens.json', token: '--space-3', value: '12px' }]);

  const text = rhythmguard(dir, 'scale', ...args);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Scale {10}0, 4, 8, 12, 16, 24/);
  assert.match(text.stdout, /Source {9}token-sources \(tokens\/tokens\.json\): the configured token sources/);
  assert.match(text.stdout, /12px {6}var\(--space-3\) tokens\/tokens\.json/);
});

test('rhythmguard scale reads .rhythmguardrc.json and the default the way the audit does', () => {
  const dir = project();
  const fallback = JSON.parse(rhythmguard(dir, 'scale', '--format', 'json').stdout);
  assert.equal(fallback.scale.source, 'default');

  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { scale: 'auto', tokenSources: ['./tokens/tokens.json'] } }));
  const fromRc = JSON.parse(rhythmguard(dir, 'scale', '--format', 'json').stdout);
  assert.equal(fromRc.scale.source, 'token-sources');
  assert.equal(fromRc.command.config.file, '.rhythmguardrc.json');

  const scanned = project();
  fs.writeFileSync(path.join(scanned, 'src', 'tokens.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n');
  const css = JSON.parse(rhythmguard(scanned, 'scale', 'src', '--scale', 'auto', '--format', 'json').stdout);
  assert.equal(css.scale.source, 'scanned-css');
  assert.deepEqual(css.steps.find((step) => step.value === 8).tokens.map((entry) => entry.token), ['--space-2']);
});

test('rhythmguard scale exits 2 on a configured token source that does not exist', () => {
  const dir = project();
  const result = rhythmguard(dir, 'scale', '--scale', 'auto', '--token-source', './tokens/missing.json');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Token source not found: \.\/tokens\/missing\.json/);
});

test('rhythmguard scale rejects audit-only flags and formats, and has help', () => {
  const dir = project();
  assert.equal(rhythmguard(dir, 'scale', '--format', 'markdown').status, 1);
  const gate = rhythmguard(dir, 'scale', '--max-findings', '0');
  assert.equal(gate.status, 1);
  assert.match(gate.stderr, /Unknown option: --max-findings/);
  const help = rhythmguard(dir, 'scale', '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: rhythmguard scale \[dir\] \[options\]/);
  assert.match(rhythmguard(dir, '--help').stdout, /scale \[dir\]/);
});
