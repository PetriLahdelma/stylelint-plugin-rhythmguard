'use strict';

/**
 * `--tailwind-config` and `audit.tailwindConfigPath` (tf-06): with
 * `--scale auto` the audit reads a Tailwind v3 config's spacing, as the rules
 * do with `tailwindConfigPath`, and only when one is configured. A configured
 * path that does not exist exits 2, like a missing token source. A Tailwind
 * project with no tokens falls back to Tailwind's ladder, as configs/tailwind does.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-tailwind-config-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function audit(dir, ...args) {
  return spawnSync(process.execPath, [cliPath, 'audit', '.', '--format', 'json', ...args], { cwd: dir, encoding: 'utf8' });
}

const CONFIG = "module.exports = { theme: { spacing: { 0: '0px', 1: '4px', 2: '8px', 3: '12px', 5: '20px', 10: '40px' } } };\n";

test('--tailwind-config gives the --scale auto scale, with source "tailwind"', () => {
  const dir = project({ 'tailwind.config.js': CONFIG, 'src/a.css': '.a { padding: 16px; margin: 20px; }\n' });
  const result = audit(dir, '--no-config', '--scale', 'auto', '--tailwind-config', './tailwind.config.js');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.contracts.scale.source, 'tailwind');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 20, 40]);
  assert.deepEqual(report.contracts.scale.files, ['tailwind.config.js']);
  assert.deepEqual(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.value), ['16px']);
});

test('audit.tailwindConfigPath resolves from the rc file, and the config is never loaded unless configured', () => {
  const dir = project({
    '.rhythmguardrc.json': JSON.stringify({ audit: { scale: 'auto', tailwindConfigPath: './tailwind.config.js' } }),
    'tailwind.config.js': CONFIG,
    'src/a.css': '.a { margin: 20px; }\n',
  });
  assert.equal(JSON.parse(audit(dir).stdout).contracts.scale.source, 'tailwind');

  // Without the key the file is not run: a config that throws when loaded is never touched.
  fs.writeFileSync(path.join(dir, 'tailwind.config.js'), "throw new Error('loaded');\n");
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { scale: 'auto' } }));
  const report = JSON.parse(audit(dir).stdout);
  assert.equal(report.contracts.scale.source, 'fallback');
});

test('a Tailwind project with no tokens falls back to Tailwind\'s ladder, as configs/tailwind does', () => {
  const dir = project({ 'package.json': JSON.stringify({ devDependencies: { tailwindcss: '^3.4.0' } }), 'src/a.css': '.a { margin: 20px; padding: 13px; }\n' });
  const report = JSON.parse(audit(dir, '--no-config', '--scale', 'auto').stdout);
  assert.equal(report.contracts.scale.source, 'fallback');
  assert.ok(report.contracts.scale.values.includes(20) && report.contracts.scale.values.includes(384));
  assert.deepEqual(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.value), ['13px']);
});

test('a configured Tailwind config that does not exist exits 2', () => {
  const dir = project({ 'src/a.css': '.a { margin: 20px; }\n' });
  const result = audit(dir, '--no-config', '--scale', 'auto', '--tailwind-config', './missing.config.js');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Tailwind config not found: \.\/missing\.config\.js/);
});
