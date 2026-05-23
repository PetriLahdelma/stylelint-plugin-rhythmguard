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
  const result = runAudit(fixtureDir, '--format', 'json-v1');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.formatVersion, 5);
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
  assert.ok(report.tokenContract.rawValueMatches.some(({ value, tokens }) =>
    value === '16px' && tokens.includes('--spacing-4'),
  ));
  assert.ok(report.tokenContract.rawValueCandidates.some(({ value, count }) => value === '13px' && count === 2));
  assert.ok(report.topAffectedFiles.some(({ file }) => file.endsWith('Button.tsx')));
});

test('audit CLI JSON emits the 2.0 contract shape by default', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(fixtureDir, '--format', 'json');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, '2.0');
  assert.equal(report.command.directory.endsWith('/src') || report.command.directory === path.join(fixtureDir, 'src'), true);
  assert.equal(report.scanned.cssFiles, 1);
  assert.equal(report.contracts.tokens.missingTokens[0].token, '--spacing-missing');
  assert.equal(report.findings.tailwind.length, 2);
});

test('audit CLI prints schema and can write HTML output', () => {
  const fixtureDir = createAuditFixture();
  const schemaResult = runAuditCommand(fixtureDir, 'src', '--schema');
  assert.equal(schemaResult.status, 0, schemaResult.stderr);
  assert.equal(JSON.parse(schemaResult.stdout).properties.schemaVersion.const, '2.0');

  const outputPath = path.join(fixtureDir, 'report.html');
  const htmlResult = runAuditCommand(
    fixtureDir,
    'src',
    '--format',
    'html',
    '--output',
    outputPath,
  );
  assert.equal(htmlResult.status, 0, htmlResult.stderr);
  assert.equal(htmlResult.stdout, '');
  assert.match(fs.readFileSync(outputPath, 'utf8'), /Rhythmguard Design-System Audit/);
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

  const result = runAudit(fixtureDir, '--format', 'json-v1', '--ignore', 'legacy/**,vendor');

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

  const result = runAudit(fixtureDir, '--format', 'json-v1');

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

  const result = runAudit(fixtureDir, '--format', 'json-v1', '--ignore-path', ignorePath);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css.some(({ file }) => file.includes('legacy/')), false);
});

test('audit CLI loads external CSS token sources outside the scan directory', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-token-source-css-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.css'),
    '@theme { --spacing-4: 16px; --spacing-8: 32px; }\n',
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    '.card { padding: var(--spacing-4); margin: var(--spacing-missing); gap: 16px; }\n',
  );

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'tokens.css',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources.length, 1);
  assert.equal(report.tokenContract.sources[0].format, 'css');
  assert.equal(report.tokenContract.sources[0].tokenCount, 2);
  assert.equal(report.tokenContract.missingTokens.some(({ token }) => token === '--spacing-4'), false);
  assert.equal(report.tokenContract.missingTokens.some(({ token }) => token === '--spacing-missing'), true);
  assert.equal(report.tokenContract.unusedTokens.some(({ token }) => token === '--spacing-8'), true);
  assert.ok(report.tokenContract.rawValueMatches.some(({ value, tokens }) =>
    value === '16px' && tokens.includes('--spacing-4'),
  ));
});

test('audit CLI loads DTCG token sources', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-token-source-dtcg-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.json'),
    JSON.stringify({
      spacing: {
        $type: 'dimension',
        4: { $value: '16px' },
      },
    }),
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    '.card { padding: var(--spacing-4); }\n',
  );

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'tokens.json',
    '--token-source-format',
    'dtcg',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources[0].format, 'dtcg');
  assert.equal(report.tokenContract.missingTokens.length, 0);
  assert.ok(report.tokenContract.definedTokens.some(({ token }) => token === '--spacing-4'));
});

test('audit CLI loads Style Dictionary token sources', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-token-source-sd-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.json'),
    JSON.stringify({
      spacing: {
        4: { value: '16px', type: 'dimension' },
      },
    }),
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    '.card { padding: var(--spacing-4); }\n',
  );

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'tokens.json',
    '--token-source-format',
    'style-dictionary',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources[0].format, 'style-dictionary');
  assert.equal(report.tokenContract.missingTokens.length, 0);
});

test('audit CLI loads flat JSON token sources', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-token-source-flat-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.json'),
    JSON.stringify({
      '--spacing-4': '16px',
    }),
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    '.card { padding: var(--spacing-4); }\n',
  );

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'tokens.json',
    '--token-source-format',
    'flat-json',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources[0].format, 'flat-json');
  assert.equal(report.tokenContract.missingTokens.length, 0);
});

test('audit CLI loads config and lets CLI scalar options override config', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-config-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.mkdirSync(path.join(fixtureDir, 'src', 'ignored'));
  fs.writeFileSync(
    path.join(fixtureDir, 'tokens.json'),
    JSON.stringify({
      '--spacing-4': '16px',
    }),
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.css'),
    '.card { padding: var(--spacing-4); gap: 13px; margin: 13px; }\n',
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'ignored', 'ignored.css'),
    '.ignored { padding: 13px; }\n',
  );
  fs.writeFileSync(
    path.join(fixtureDir, '.rhythmguardrc.json'),
    JSON.stringify({
      audit: {
        ignore: ['ignored/**'],
        tokenCandidateMinCount: 3,
        tokenKind: 'radius',
        tokenSources: ['tokens.json'],
      },
    }),
  );

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-kind',
    'spacing',
    '--token-candidate-min-count',
    '2',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.config.file, '.rhythmguardrc.json');
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.tokenContract.missingTokens.length, 0);
  assert.ok(report.tokenContract.rawValueCandidates.some(({ value, count }) =>
    value === '13px' && count === 2,
  ));
});

test('audit CLI handles repeated token sources without duplicating token definitions', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-duplicate-sources-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ '--spacing-4': '16px' }));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.css'), '.card { padding: var(--spacing-4); }\n');

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'tokens.json,tokens.json',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources.length, 2);
  assert.equal(report.tokenContract.definedTokens.filter(({ token }) => token === '--spacing-4').length, 1);
});

test('audit CLI reports missing token source warnings without failing', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-missing-source-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.css'), '.card { padding: 16px; }\n');

  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--token-source',
    'missing.json',
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.tokenContract.sources[0].warnings.length, 1);
  assert.match(report.tokenSourceWarnings[0], /Token source not found/);
});

test('audit CLI fails on invalid rhythmguard config', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-invalid-config-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.css'), '.card { padding: 16px; }\n');
  fs.writeFileSync(path.join(fixtureDir, '.rhythmguardrc.json'), '{ invalid json');

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid Rhythmguard config/);
});

test('audit CLI writes and compares baselines for new drift gating', () => {
  const fixtureDir = createAuditFixture();
  const baselinePath = path.join(fixtureDir, 'baseline.json');
  const writeResult = runAudit(fixtureDir, '--format', 'json-v1', '--write-baseline', baselinePath);

  assert.equal(writeResult.status, 0, writeResult.stderr);
  assert.equal(fs.existsSync(baselinePath), true);

  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'New.tsx'),
    'export const New = <div className="p-[21px]" />;\n',
  );

  const result = runAudit(
    fixtureDir,
    '--format', 'json-v1',
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
    '--format', 'json-v1',
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

test('audit CLI includes motion drift only when requested', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-motion-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'motion.css'),
    '.button { transition: opacity 175ms cubic-bezier(.2, 0, 0, 1); }\n',
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'Button.tsx'),
    'export const Button = <button className="duration-[175ms] ease-[cubic-bezier(.2,0,0,1)]" />;\n',
  );

  const defaultResult = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1');
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  assert.equal(JSON.parse(defaultResult.stdout).summary.motionFindings, 0);

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1', '--include-motion');
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.motion.enabled, true);
  assert.equal(report.summary.motionFindings, 4);
  assert.equal(report.findings.motion.length, 4);
  assert.equal(report.motion.values['175ms'], 2);
  assert.ok(report.motion.values['cubic-bezier(.2,0,0,1)'] || report.motion.values['cubic-bezier(.2, 0, 0, 1)']);
});

test('audit CLI compares motion findings in baselines', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-motion-baseline-'));
  const baselinePath = path.join(fixtureDir, 'baseline.json');
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'motion.css'), '.button { transition-duration: 150ms; }\n');

  const writeResult = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--include-motion',
    '--write-baseline',
    baselinePath,
  );
  assert.equal(writeResult.status, 0, writeResult.stderr);

  fs.writeFileSync(path.join(fixtureDir, 'src', 'motion.css'), '.button { transition-duration: 175ms; }\n');
  const result = runAuditCommand(
    fixtureDir,
    'src',
    '--format', 'json-v1',
    '--include-motion',
    '--since-baseline',
    baselinePath,
    '--fail-on-new-drift',
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /new drift found/);

  const report = JSON.parse(result.stdout);
  assert.equal(report.baseline.newFindingsCount, 1);
  assert.equal(report.baseline.newFindings[0].type, 'motion-duration');
});

test('audit CLI can enable motion scanning from config', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-motion-config-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'motion.css'), '.button { transition-duration: 175ms; }\n');
  fs.writeFileSync(
    path.join(fixtureDir, '.rhythmguardrc.json'),
    JSON.stringify({
      audit: {
        includeMotion: true,
      },
    }),
  );

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1');
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.motion.enabled, true);
  assert.equal(report.summary.motionFindings, 1);
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

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1', '--staged');

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

  const result = runAuditCommand(fixtureDir, 'src', '--format', 'json-v1', '--since', 'HEAD');

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.scanScope.mode, 'since');
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.findings.css[0].file, 'src/changed.css');
});
