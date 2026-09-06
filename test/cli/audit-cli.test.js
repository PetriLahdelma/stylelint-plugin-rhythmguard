'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

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
  return runAuditCommand(path.join(__dirname, '..', '..'), path.join(fixtureDir, 'src'), ...args);
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
  assert.equal(report.offScaleProperties.padding, 1);
  assert.equal(report.findings.css.find((finding) => finding.value === '13px').property, 'padding');
  assert.equal(report.findings.css.find((finding) => finding.value === '16px').property, 'gap');
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
  assert.deepEqual(report.contracts.scale.offScaleProperties, { padding: 1 });
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
  assert.match(result.stdout, /## CSS Off-Scale Properties\n\n\| Property \| Count \|\n\| --- \| ---: \|\n\| `padding` \| 1 \|/);
  assert.match(result.stdout, /`md:p-\[13px\]`/);
  assert.match(result.stdout, /`md:p-\[12px\]`/);
});

test('audit CLI --format badge writes a shields.io endpoint document', () => {
  const fixtureDir = createAuditFixture();
  const result = runAudit(fixtureDir, '--format', 'badge');

  assert.equal(result.status, 0, result.stderr);
  const badge = JSON.parse(result.stdout);
  assert.equal(badge.schemaVersion, 1);
  assert.equal(badge.label, 'spacing drift');
  assert.equal(badge.message, '100%');
  assert.equal(badge.color, 'orange');

  const counted = runAudit(fixtureDir, '--format', 'badge', '--badge-metric', 'findings');
  assert.equal(counted.status, 0, counted.stderr);
  assert.equal(JSON.parse(counted.stdout).message, '3');

  const gated = runAudit(fixtureDir, '--format', 'badge', '--max-findings', '0');
  assert.equal(gated.status, 1, 'gate flags apply to the badge format too');
  assert.equal(JSON.parse(gated.stdout).label, 'spacing drift', 'the badge is still written when the gate fails');

  const written = runAudit(fixtureDir, '--format', 'badge', '--output', path.join(fixtureDir, 'badges', 'spacing.json'));
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixtureDir, 'badges', 'spacing.json'), 'utf8')).label, 'spacing drift');
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

test('audit CLI github format emits workflow-command annotations for CI', () => {
  const fixtureDir = createAuditFixture();
  // Run from the fixture root, as a CI job would, so file= paths are repo-relative.
  const result = runAuditCommand(fixtureDir, 'src', '--format', 'github');

  assert.equal(result.status, 0, result.stderr);

  const lines = result.stdout.trim().split('\n');
  const warningLines = lines.filter((line) => line.startsWith('::warning '));
  const noticeLines = lines.filter((line) => line.startsWith('::notice '));

  assert.ok(warningLines.length >= 2, `expected annotations, got:\n${result.stdout}`);
  assert.ok(
    warningLines.some((line) =>
      /^::warning file=src\/card\.css,line=3,col=\d+,title=rhythmguard\/use-scale::Unexpected off-scale value "13px"/.test(line),
    ),
    `missing css annotation in:\n${result.stdout}`,
  );
  assert.ok(
    warningLines.some((line) =>
      /^::warning file=src\/Button\.tsx,line=2,col=\d+,title=rhythmguard-tailwind\/tailwind-class-use-scale::/.test(line),
    ),
    `missing tailwind annotation in:\n${result.stdout}`,
  );
  assert.equal(noticeLines.length, 1);
  assert.match(noticeLines[0], /^::notice title=Rhythmguard audit::\d+ findings? across \d+ files?, \d+%25 scale cleanliness$/);
  assert.equal(lines.every((line) => line.startsWith('::')), true, 'github format must emit only workflow commands');
});

test('audit CLI github format escapes newlines and commas in annotation messages', () => {
  const fixtureDir = createAuditFixture();
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'odd.css'),
    '.odd { margin: 13px 7px; }\n',
  );
  const result = runAuditCommand(fixtureDir, 'src', '--format', 'github');

  assert.equal(result.status, 0, result.stderr);
  for (const line of result.stdout.trim().split('\n')) {
    const [, message = ''] = line.split('::').length >= 3 ? [null, line.slice(line.indexOf('::', 2) + 2)] : [];
    assert.equal(message.includes('\n'), false);
    assert.equal(/%(?!25|0D|0A|2C|3A)/.test(message), false, `unescaped % in: ${line}`);
  }
});

test('audit CLI --scale auto infers the scale from spacing tokens across scanned CSS', () => {
  const fixtureDir = createAuditFixture();
  fs.writeFileSync(path.join(fixtureDir, 'src', 'theme.css'), ':root { --spacing-2: 8px; --spacing-3: 12px; }\n');
  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.contracts.scale.values, [0, 8, 12, 16]);
  assert.equal(report.contracts.scale.source, 'scanned-css');
  assert.deepEqual(report.contracts.scale.files, ['src/card.css', 'src/theme.css']);

  const offScale = report.findings.css.filter((finding) => finding.type === 'off-scale');
  assert.deepEqual(offScale.map((finding) => finding.value), ['13px']);
});

test('audit CLI --scale auto prefers external token sources over scanned CSS', () => {
  const fixtureDir = createAuditFixture();
  fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({
    spacing: {
      1: { $value: '4px', $type: 'dimension' },
      2: { $value: '8px', $type: 'dimension' },
      3: { $value: '12px', $type: 'dimension' },
      4: { $value: '16px', $type: 'dimension' },
    },
  }));
  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--token-source', './tokens.json', '--format', 'json');

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 16]);
  assert.equal(report.contracts.scale.source, 'token-sources');
  assert.deepEqual(report.contracts.scale.files, ['tokens.json']);
});

test('audit CLI --scale auto falls back to the default scale and reports it', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-notokens-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'plain.css'), '.a { margin: 13px; }\n');
  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.contracts.scale.source, 'fallback');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 16, 24, 32]);

  const explicit = runAuditCommand(fixtureDir, 'src', '--scale', '0,4,8', '--format', 'json');
  assert.equal(JSON.parse(explicit.stdout).contracts.scale.source, 'explicit');
  const defaulted = runAuditCommand(fixtureDir, 'src', '--format', 'json');
  assert.equal(JSON.parse(defaulted.stdout).contracts.scale.source, 'default');
});

test('audit CLI markdown reports the scale source', () => {
  const fixtureDir = createAuditFixture();
  fs.writeFileSync(path.join(fixtureDir, 'src', 'theme.css'), ':root { --spacing-2: 8px; --spacing-3: 12px; }\n');
  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'markdown');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\| Scale source \| scanned-css \(src\/card\.css, src\/theme\.css\) \|/);
  assert.match(result.stdout, /\| Scale \| 0, 8, 12, 16 \|/);
});

test('audit CLI scans SCSS files through postcss-scss and reports them separately', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-scss-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'tokens.scss'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n');
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'card.scss'),
    [
      '$gap: 13px;',
      '@use "sass:math";',
      '.card {',
      '  padding: $gap;',
      '  margin: 13px;',
      '  .title { gap: 7px; width: math.div(100%, 3); }',
      '  &:hover { inset: 8px; }',
      '}',
      '',
    ].join('\n'),
  );

  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.scanned.cssFiles, 2, 'scss files count as style files');
  assert.equal(report.scanned.scssFiles, 2);
  assert.equal(report.contracts.scale.source, 'scanned-css', 'tokens declared in scss feed the scale');
  const offScale = report.findings.css.filter((finding) => finding.type === 'off-scale');
  assert.deepEqual(offScale.map((finding) => finding.value).sort(), ['13px', '7px']);
  assert.ok(offScale.every((finding) => finding.file.endsWith('card.scss')));
  assert.equal(report.scanned.scssSkipped, 0);

  const markdown = runAuditCommand(fixtureDir, 'src', '--format', 'markdown');
  assert.match(markdown.stdout, /\| SCSS files scanned \| 2 \|/);
});

test('audit CLI --scale auto infers the scale from Sass variables and maps in SCSS sources', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-sass-scale-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'src', '_variables.scss'),
    '$spacer: 1rem !default;\n$spacers: (0: 0, 1: $spacer * .25, 2: $spacer * .5, 3: $spacer, 4: $spacer * 1.5) !default;\n',
  );
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.scss'), '.card { padding: 13px; margin: 8px; }\n');

  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.contracts.scale.source, 'scanned-css');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 16, 24]);
  const offScale = report.findings.css.filter((finding) => finding.type === 'off-scale');
  assert.deepEqual(offScale.map((finding) => finding.value), ['13px']);
});

test('audit CLI --scale auto ignores token declarations in test and fixture directories when inferring the scale', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-testdirs-'));
  fs.mkdirSync(path.join(fixtureDir, 'src', 'test'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'src', 'theme.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; }\n');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'test', 'override.scss'), '$spacing-weird: 7px;\n.t { margin: 7px; }\n');

  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12], 'the 7px test token must not join the scale');
  assert.deepEqual(report.contracts.scale.files, ['src/theme.css']);
});

test('audit CLI --scale auto reports token-package provenance when the scale comes from node_modules', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-pkg-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.mkdirSync(path.join(fixtureDir, 'node_modules', '@radix-ui', 'themes'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{"name":"fixture","dependencies":{"@radix-ui/themes":"^3.0.0"}}');
  fs.writeFileSync(path.join(fixtureDir, 'node_modules', '@radix-ui', 'themes', 'package.json'), '{"name":"@radix-ui/themes","version":"3.0.0"}');
  fs.writeFileSync(
    path.join(fixtureDir, 'node_modules', '@radix-ui', 'themes', 'tokens.css'),
    ':root { --space-1: calc(4px * var(--scaling)); --space-2: calc(8px * var(--scaling)); --space-3: calc(12px * var(--scaling)); --space-4: calc(16px * var(--scaling)); }\n',
  );
  fs.writeFileSync(path.join(fixtureDir, 'src', 'card.css'), '.card { padding: 13px; margin: 8px; }\n');

  const result = runAuditCommand(fixtureDir, 'src', '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.contracts.scale.source, 'token-package');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 16]);
  assert.deepEqual(report.contracts.scale.files, ['node_modules/@radix-ui/themes/tokens.css']);
});

test('audit CLI --scale auto rejects an incoherent inferred scale, falls back, and reports why (issue #88)', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-reject-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'chip.css'), ':root { --chip-spacing: 3px; --avatar-spacing: 2px; --badge-spacing: 5px; --modal-spacing: 25px; }\n.chip { padding: 13px; }\n');

  const json = runAudit(fixtureDir, '--scale', 'auto', '--format', 'json');
  assert.equal(json.status, 0, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.contracts.scale.source, 'fallback');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 16, 24, 32]);
  assert.equal(report.contracts.scale.rejected.source, 'scanned-css');
  assert.deepEqual(report.contracts.scale.rejected.reasons, ['no common step', 'sources are component files']);
  assert.deepEqual(report.contracts.scale.rejected.values, [0, 2, 3, 5, 25]);

  const markdown = runAudit(fixtureDir, '--scale', 'auto', '--format', 'markdown');
  assert.match(markdown.stdout, /\| Scale source \| fallback \(scanned-css rejected: no common step, sources are component files\) \|/);
});

test('audit CLI --scale auto does not read a selector like .grid--auto-spacing:first-child as a token declaration', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-selector-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(path.join(fixtureDir, 'src', 'grid.css'), [
    ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }',
    '.grid--auto-spacing:first-child,',
    '.grid--l { padding: 13px; }',
    '',
  ].join('\n'));

  const result = runAudit(fixtureDir, '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.contracts.scale.source, 'scanned-css');
  assert.deepEqual(report.contracts.scale.values, [0, 4, 8, 12, 16]);
});

test('audit CLI --scale auto infers from root-level tokens and reports only their files when components redefine spacing (issue #54)', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-audit-root-'));
  fs.mkdirSync(path.join(fixtureDir, 'src', 'components', 'Chip'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'src', 'theme.css'), ':root { --m-spacing-xs: 10px; --m-spacing-sm: 12px; --m-spacing-md: 16px; --m-spacing-lg: 20px; --m-spacing-xl: 32px; }\n');
  fs.writeFileSync(path.join(fixtureDir, 'src', 'components', 'Chip', 'Chip.module.css'), '.chip { --chip-spacing: 3px; --chip-spacing-lg: 22px; padding: 22px; }\n');

  const result = runAudit(fixtureDir, '--scale', 'auto', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const scale = JSON.parse(result.stdout).contracts.scale;
  assert.equal(scale.source, 'scanned-css');
  assert.deepEqual(scale.values, [0, 10, 12, 16, 20, 32]);
  assert.deepEqual(scale.files.map((file) => path.basename(file)), ['theme.css']);
});
