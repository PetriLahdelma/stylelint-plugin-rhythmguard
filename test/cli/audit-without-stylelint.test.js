'use strict';

/**
 * An ESLint-only project has the plugin's `rhythmguard` bin but no Stylelint
 * (dx-03, ai-02). The audit and the quickstart must still read class strings,
 * count the stylesheets as not audited with what to install, and fail a gate
 * rather than pass on that partial read. Stylelint is hidden with an ESM
 * resolve hook, since the audit loads it with import().
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-no-stylelint-hooks-'));
fs.writeFileSync(path.join(hooksDir, 'hooks.mjs'), [
  'export async function resolve(specifier, context, next) {',
  "  if (specifier === 'stylelint' || specifier.startsWith('stylelint/')) {",
  "    const error = new Error(`Cannot find package 'stylelint' imported from ${context.parentURL}`);",
  "    error.code = 'ERR_MODULE_NOT_FOUND';",
  '    throw error;',
  '  }',
  '  return next(specifier, context);',
  '}',
  '',
].join('\n'));
fs.writeFileSync(path.join(hooksDir, 'register.mjs'), "import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-eslint-only-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app","dependencies":{"tailwindcss":"^4.3.0"}}');
  fs.writeFileSync(path.join(dir, 'src', 'app.css'), '@import "tailwindcss";\n.card { margin: 13px; }\n');
  fs.writeFileSync(path.join(dir, 'src', 'a.jsx'), 'export const A = () => <div className="p-[13px]" />;\n');
  return dir;
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, ['--import', path.join(hooksDir, 'register.mjs'), cliPath, ...args], { cwd, encoding: 'utf8' });
}

test('without Stylelint the audit reads class strings and lists the stylesheets as not audited', () => {
  const dir = fixture();
  const text = run(dir, 'audit', 'src');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Stylesheets not audited\s+1\s+\(Stylelint is not installed: npm install --save-dev stylelint\)/);

  const json = run(dir, 'audit', 'src', '--format', 'json');
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.scanned.stylelintMissing, 1);
  assert.equal(report.scanned.cssFiles, 0, 'a stylesheet that was not audited is not counted as scanned');
  assert.deepEqual(report.findings.css, []);
  assert.deepEqual(report.findings.tailwind.map((finding) => finding.token), ['p-[13px]']);

  const markdown = run(dir, 'audit', 'src', '--format', 'markdown');
  assert.match(markdown.stdout, /Stylesheets not audited \(Stylelint is not installed/);
});

test('without Stylelint every gate flag fails and says what to install', () => {
  const dir = fixture();
  for (const gate of [['--max-findings', '100'], ['--min-cleanliness', '0']]) {
    const result = run(dir, 'audit', 'src', ...gate);
    assert.equal(result.status, 1, `${gate[0]} must fail on a partial read`);
    assert.match(result.stderr, /1 stylesheet\(s\) were not audited because Stylelint is not installed \(npm install --save-dev stylelint\), so the gate cannot pass/);
  }
});

test('without Stylelint the quickstart prints the ESLint config first, then how to add Stylelint', () => {
  const dir = fixture();
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped\s+1 not audited \(1 because Stylelint is not installed\)/);
  const eslintAt = result.stdout.indexOf('paste this into eslint.config.js');
  const stylelintAt = result.stdout.search(/npm install --save-dev "stylelint@[^"]+" stylelint-plugin-rhythmguard/);
  assert.ok(eslintAt > 0 && stylelintAt > eslintAt, 'the ESLint snippet comes before the Stylelint install line');
});
