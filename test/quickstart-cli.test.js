'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', 'src', 'cli', 'index.js');

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

function fixture({ tailwind = false, tokens = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-quickstart-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture',
    devDependencies: tailwind ? { tailwindcss: '^4.1.0' } : {},
  }));
  fs.writeFileSync(
    path.join(dir, 'src', 'app.css'),
    [
      tailwind ? '@import "tailwindcss";' : '',
      ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }',
      '.card { padding: 13px; margin: 8px; }',
      '',
    ].join('\n'),
  );
  if (tokens) {
    fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({
      spacing: { 1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '12px' }, 4: { $value: '16px' } },
    }));
  }
  return dir;
}

test('bare `rhythmguard` runs the zero-config quickstart: detection, inferred scale, findings, paste-ready config', () => {
  const dir = fixture();
  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /Scale\s+0, 4, 8, 12, 16/, 'inferred scale is printed');
  assert.match(out, /scanned-css/, 'scale provenance is printed');
  assert.match(out, /13px/, 'the off-scale value shows up');
  assert.match(out, /\.stylelintrc\.json/, 'a config file name is suggested');
  assert.match(out, /"scale": "auto"/, 'the suggested config uses auto inference');
  assert.match(out, /stylelint-plugin-rhythmguard\/configs\/recommended/, 'plain CSS projects get the recommended config');
  assert.doesNotMatch(out, /eslint\.config/, 'no ESLint snippet without Tailwind');
});

test('quickstart detects Tailwind and adds the class-string companion to the suggestion', () => {
  const dir = fixture({ tailwind: true });
  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tailwind\s+v4/);
  assert.match(result.stdout, /configs\/tailwind/);
  assert.doesNotMatch(result.stdout, /react-tailwind/);
  assert.match(result.stdout, /eslint\.config\.js/);
  assert.match(result.stdout, /tailwind-class-use-scale/);
});

test('quickstart points scaleSources at a token file it finds', () => {
  const dir = fixture({ tokens: true });
  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /token-sources \(tokens\.json\)/, 'token file wins over scanned css');
  assert.match(result.stdout, /"scaleSources": \[\s*"\.\/tokens\.json"\s*\]/);
});

test('quickstart keeps --help working and exits 0 with no findings noise on an empty directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-quickstart-empty-'));
  const help = run(dir, '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: rhythmguard/);

  const empty = run(dir);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /No CSS files found/);
});
