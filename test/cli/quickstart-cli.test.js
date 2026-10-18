'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

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
  assert.match(out, /Top properties\s+padding ×1/, 'off-scale findings are broken down by property');
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

test('with no tokens, quickstart names the scale it used and suggests a config that reproduces its result (#246)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-quickstart-fallback-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));
  const code = '.a { margin: 40px; padding: 48px; }\n';
  fs.writeFileSync(path.join(dir, 'a.css'), code);
  const result = run(dir);

  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  assert.match(out, /Scale\s+0, 4, 8, 12, 16, 24, 32\n/);
  assert.match(out, /No spacing tokens found; the audit's default scale is being used\./);
  assert.doesNotMatch(out, /rhythmic-4/, 'the fallback is not the rhythmic-4 preset, so it is not called that');
  assert.match(out, /Off-scale\s+2 in CSS/);

  const pasted = out.split('Paste this into .stylelintrc.json:')[1].split('\n\n')[1];
  const suggested = JSON.parse(pasted);
  assert.deepEqual(suggested.rules['rhythmguard/use-scale'], [true, { scale: [0, 4, 8, 12, 16, 24, 32] }]);

  const { lintCss } = require('../helpers/lint');
  const linted = await lintCss({ code, rules: suggested.rules });
  assert.equal(linted.warnings.length, 2, 'the pasted config reports what quickstart reported');
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

test('the audit commands quickstart suggests report the scale and findings quickstart reported (#287)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-quickstart-next-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({
    spacing: { 0: { $value: '0px' }, 1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '12px' }, 4: { $value: '20px' } },
  }));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { margin: 16px; padding: 20px; }\n');

  const quickstart = run(dir);
  assert.equal(quickstart.status, 0, quickstart.stderr);
  assert.match(quickstart.stdout, /Scale\s+0, 4, 8, 12, 20\n/);
  assert.match(quickstart.stdout, /Top values\s+16px ×1\n/);

  const markdownCommand = quickstart.stdout.match(/^ {6}npx rhythmguard audit (.+) --format markdown$/m);
  assert.ok(markdownCommand, quickstart.stdout);
  assert.equal(markdownCommand[1], '. --scale auto --token-source ./tokens.json');
  assert.match(quickstart.stdout, /^ {6}npx rhythmguard audit \. --scale auto --token-source \.\/tokens\.json --write-baseline$/m);

  const audit = run(dir, 'audit', ...markdownCommand[1].split(' '), '--format', 'json');
  assert.equal(audit.status, 0, audit.stderr);
  const report = JSON.parse(audit.stdout);
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 20]);
  assert.deepEqual(report.contracts.scale.offScaleValues, { '16px': 1 });

  // With an rc file quickstart reads the rc's token sources, and says only --scale auto.
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { tokenSources: ['tokens.json'] } }));
  assert.match(run(dir).stdout, /^ {6}npx rhythmguard audit \. --scale auto --format markdown$/m);
});

test('quickstart --help prints its usage instead of auditing; an unknown flag is refused (#286)', () => {
  const dir = fixture();
  const help = run(dir, 'quickstart', '--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage: rhythmguard \[quickstart\]/);
  assert.doesNotMatch(help.stdout, /Rhythmguard quickstart/);

  const unknown = run(dir, 'quickstart', '--scale', 'auto');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /^Unknown option: --scale\n\nUsage: rhythmguard \[quickstart\]/);
  assert.equal(unknown.stdout, '');
});
