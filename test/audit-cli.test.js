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
      '  margin: var(--spacing-missing);',
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
  return runAuditCommand(path.join(__dirname, '..'), path.join(fixtureDir, 'src'), ...args);
}

function runAuditCommand(cwd, dir, ...args) {
  return spawnSync(
    process.execPath,
    [cliPath, 'audit', dir, ...args],
    {
      cwd,
      encoding: 'utf8',
    },
  );
}

function runGit(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('audit CLI JSON reports CSS and Tailwind design-system drift', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(fixtureDir, '--format', 'json');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.formatVersion, 3);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.templateFilesScanned, 1);
  assert.equal(report.offScaleValues['13px'], 1);
  assert.equal(report.tokenOpportunities['16px'], 1);
  assert.equal(report.tailwindArbitraryValues['13px'], 1);
  assert.equal(report.tailwindArbitraryValues['-0.3rem'], 1);
  assert.equal(report.findings.tailwind.length, 2);
  assert.equal(report.summary.tailwindArbitrarySpacing, 2);
  assert.equal(report.tokenContract.missingTokens[0].token, '--spacing-missing');
  assert.ok(report.tokenContract.unusedTokens.some(({ token }) => token === '--spacing-4'));
  assert.ok(report.tokenContract.rawValueCandidates.some(({ value, count }) => value === '13px' && count === 2));
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

test('audit CLI ignores root-relative paths before scanning', () => {
  const fixtureDir = createAuditFixture();
  const ignoredDir = path.join(fixtureDir, 'src', 'legacy');
  fs.mkdirSync(ignoredDir);
  fs.writeFileSync(
    path.join(ignoredDir, 'ignored.css'),
    '.legacy { padding: 13px; gap: 16px; }\n',
  );
  fs.writeFileSync(
    path.join(ignoredDir, 'Ignored.tsx'),
    'export const ignored = <div className="p-[13px]" />;\n',
  );
  const vendorDir = path.join(fixtureDir, 'src', 'vendor');
  fs.mkdirSync(vendorDir);
  fs.writeFileSync(
    path.join(vendorDir, 'vendor.css'),
    '.vendor { padding: 13px; }\n',
  );

  const result = runAudit(fixtureDir, '--format', 'json', '--ignore', 'legacy/**,vendor');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.templateFilesScanned, 1);
  assert.equal(report.findings.css.some(({ file }) => file.includes('legacy/')), false);
  assert.equal(report.findings.css.some(({ file }) => file.includes('vendor/')), false);
  assert.equal(report.findings.tailwind.some(({ file }) => file.includes('legacy/')), false);
});

test('audit CLI scopes traversal to the requested directory', () => {
  const fixtureDir = createAuditFixture();
  fs.writeFileSync(
    path.join(fixtureDir, 'outside.css'),
    '.outside { padding: 13px; gap: 16px; }\n',
  );

  const result = runAudit(fixtureDir, '--format', 'json');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css.some(({ file }) => file.endsWith('outside.css')), false);
});

test('audit CLI loads ignore patterns from an ignore file', () => {
  const fixtureDir = createAuditFixture();
  const ignoredDir = path.join(fixtureDir, 'src', 'legacy');
  const ignorePath = path.join(fixtureDir, '.rhythmguardignore');
  fs.mkdirSync(ignoredDir);
  fs.writeFileSync(
    path.join(ignoredDir, 'ignored.css'),
    '.legacy { padding: 13px; }\n',
  );
  fs.writeFileSync(ignorePath, '# generated code\nlegacy\n');

  const result = runAudit(fixtureDir, '--format', 'json', '--ignore-path', ignorePath);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css.some(({ file }) => file.includes('legacy/')), false);
});

test('audit CLI writes and compares baselines for new drift gating', () => {
  const fixtureDir = createAuditFixture();
  const baselinePath = path.join(fixtureDir, 'baseline.json');
  const writeResult = runAudit(fixtureDir, '--format', 'json', '--write-baseline', baselinePath);

  assert.equal(writeResult.status, 0, writeResult.stderr);
  assert.equal(fs.existsSync(baselinePath), true);

  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'New.tsx'),
    'export const New = <div className="p-[21px]" />;\n',
  );

  const result = runAudit(
    fixtureDir,
    '--format',
    'json',
    '--since-baseline',
    baselinePath,
    '--fail-on-new-drift',
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /new drift found/);

  const report = JSON.parse(result.stdout);
  assert.equal(report.baseline.newFindingsCount, 1);
  assert.equal(report.baseline.newFindings[0].file.endsWith('New.tsx'), true);
});

test('audit CLI supports threshold exit gates', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(
    fixtureDir,
    '--format',
    'json',
    '--max-findings',
    '0',
    '--min-cleanliness',
    '100',
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Audit failed:/);
  assert.match(result.stderr, /--max-findings 0/);
  assert.match(result.stderr, /--min-cleanliness 100%/);
});

test('audit CLI can scan only staged files', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-git-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  runGit(fixtureDir, 'init');
  runGit(fixtureDir, 'config', 'user.email', 'test@example.com');
  runGit(fixtureDir, 'config', 'user.name', 'Test User');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'committed.css'), '.ok { padding: 16px; }\n');
  runGit(fixtureDir, 'add', 'src/committed.css');
  runGit(fixtureDir, 'commit', '-m', 'init');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'staged.css'), '.staged { padding: 13px; }\n');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'unstaged.css'), '.unstaged { padding: 13px; }\n');
  runGit(fixtureDir, 'add', 'src/staged.css');

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json', '--staged');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.scanScope.mode, 'staged');
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css[0].file, 'src/staged.css');
});

test('audit CLI can scan files changed since a git ref', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-git-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  runGit(fixtureDir, 'init');
  runGit(fixtureDir, 'config', 'user.email', 'test@example.com');
  runGit(fixtureDir, 'config', 'user.name', 'Test User');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'changed.css'), '.changed { padding: 16px; }\n');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'unchanged.css'), '.unchanged { padding: 13px; }\n');
  runGit(fixtureDir, 'add', 'src/changed.css', 'src/unchanged.css');
  runGit(fixtureDir, 'commit', '-m', 'init');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'changed.css'), '.changed { padding: 13px; }\n');

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json', '--since', 'HEAD');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.scanScope.mode, 'since');
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css[0].file, 'src/changed.css');
});
