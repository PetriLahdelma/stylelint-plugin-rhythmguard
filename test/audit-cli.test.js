'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', 'src', 'cli', 'index.js');

function createAuditFixture() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    [
      '@theme { --spacing-4: 16px; }',
      '.card {',
      '  padding: 13px;',
      '  gap: 16px;',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'Button.tsx'),
    [
      'export function Button() {',
      '  return <button className="md:p-[13px] has-[>button]:ml-[-0.3rem]" />;',
      '}',
      '',
    ].join('\n'),
  );

  return fixtureDir;
}

function runAudit(fixtureDir, ...args) {
  return spawnSync(
    process.execPath,
    [cliPath, 'audit', path.join(fixtureDir, 'src'), ...args],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    },
  );
}

test('audit CLI JSON reports CSS and Tailwind design-system drift', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(fixtureDir, '--format', 'json');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.formatVersion, 2);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.templateFilesScanned, 1);
  assert.equal(report.offScaleValues['13px'], 1);
  assert.equal(report.tokenOpportunities['16px'], 1);
  assert.equal(report.tailwindArbitraryValues['13px'], 1);
  assert.equal(report.tailwindArbitraryValues['-0.3rem'], 1);
  assert.equal(report.findings.tailwind.length, 2);
  assert.equal(report.summary.tailwindArbitrarySpacing, 2);
  assert.ok(report.topAffectedFiles.some(({ file }) => file.endsWith('Button.tsx')));
});

test('audit CLI markdown emits a PR-ready design-system report', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(fixtureDir, '--format', 'markdown');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# Rhythmguard Design-System Audit/m);
  assert.match(result.stdout, /\| CSS files scanned \| 1 \|/);
  assert.match(result.stdout, /## Tailwind Class-String Drift/);
  assert.match(result.stdout, /`md:p-\[13px\]`/);
  assert.match(result.stdout, /`md:p-\[12px\]`/);
});
