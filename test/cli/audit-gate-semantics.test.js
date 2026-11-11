'use strict';

/**
 * The gate accepts the fix the finding names (dx-08, ci-01, ai-03): an
 * off-scale 13px snapped to 12px is not new drift, prefer-token names the
 * token from the audit's token source, and a var() of a token nothing
 * defines is a finding under --report-missing-tokens.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function dtcgProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-gate-'));
  fs.mkdirSync(path.join(dir, 'tokens'));
  fs.mkdirSync(path.join(dir, 'app'));
  const step = (value) => ({ $type: 'dimension', $value: value });
  fs.writeFileSync(path.join(dir, 'tokens', 'tokens.json'), JSON.stringify({
    space: { 1: step('4px'), 2: step('8px'), 3: step('12px'), 4: step('16px'), 6: step('24px'), 8: step('32px') },
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'app', 'page.module.css'), '.page {\n  padding: 13px;\n  margin: 24px;\n}\n');
  return dir;
}

function rhythmguard(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

const AUDIT = ['audit', '.', '--scale', 'auto', '--token-source', './tokens/tokens.json'];

test('13px snapped to 12px passes --fail-on-new-drift and prefer-token names var(--space-3)', () => {
  const dir = dtcgProject();
  const written = rhythmguard(dir, ...AUDIT, '--write-baseline', '.rhythmguard-baseline.json');
  assert.equal(written.status, 0, written.stderr);

  // The finding's own advice: "nearest: 12px or 16px".
  const css = path.join(dir, 'app', 'page.module.css');
  fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace('13px', '12px'));

  const gated = rhythmguard(dir, ...AUDIT, '--since-baseline', '.rhythmguard-baseline.json', '--fail-on-new-drift', '--format', 'json');
  assert.equal(gated.status, 0, gated.stderr);
  const report = JSON.parse(gated.stdout);
  assert.equal(report.baseline.newDriftCount, 0);
  assert.equal(report.baseline.newTokenDebtCount, 1);
  const [debt] = report.baseline.newFindings;
  assert.equal(debt.rule, 'rhythmguard/prefer-token');
  assert.equal(debt.type, 'token-opportunity');
  assert.match(debt.text, /Unexpected raw scale value "12px"\. Use var\(--space-3\) \(tokens\/tokens\.json\)\./);

  // The 24px the token source holds is named too, not "No known token holds this value".
  const margin = report.findings.css.find((finding) => finding.value === '24px');
  assert.match(margin.text, /Use var\(--space-6\) \(tokens\/tokens\.json\)/);

  // Token debt still gates when asked for.
  const strict = rhythmguard(dir, ...AUDIT, '--since-baseline', '.rhythmguard-baseline.json', '--fail-on-new-drift', '--fail-on-new-token-debt');
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /new token debt found: 1 raw value/);
  assert.doesNotMatch(strict.stderr, /new drift found/);

  // The text report says which of the new findings are token debt.
  const text = rhythmguard(dir, ...AUDIT, '--since-baseline', '.rhythmguard-baseline.json');
  assert.match(text.stdout, /Since baseline\s+2 resolved, 1 new \(0 drift, 1 token debt\)/);
});

test('audit.failOnNewTokenDebt in .rhythmguardrc.json gates token debt like the flag', () => {
  const dir = dtcgProject();
  assert.equal(rhythmguard(dir, ...AUDIT, '--write-baseline', 'b.json').status, 0);
  const css = path.join(dir, 'app', 'page.module.css');
  fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace('13px', '12px'));
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { failOnNewTokenDebt: true } }));
  const result = rhythmguard(dir, ...AUDIT, '--since-baseline', 'b.json', '--fail-on-new-drift');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new token debt found/);
});

test('new off-scale drift still fails --fail-on-new-drift', () => {
  const dir = dtcgProject();
  assert.equal(rhythmguard(dir, ...AUDIT, '--write-baseline', 'b.json').status, 0);
  fs.appendFileSync(path.join(dir, 'app', 'page.module.css'), '.extra { gap: 7px; }\n');
  const result = rhythmguard(dir, ...AUDIT, '--since-baseline', 'b.json', '--fail-on-new-drift', '--format', 'json');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new drift found: 1 finding\(s\) not present in baseline/);
  const report = JSON.parse(result.stdout);
  assert.equal(report.baseline.newDriftCount, 1);
  // The 7px prefer-token twin is token debt, so it is not counted twice.
  assert.equal(report.baseline.newTokenDebtCount, 1);
});

test('--fail-on-new-token-debt needs --since-baseline', () => {
  const dir = dtcgProject();
  const result = rhythmguard(dir, ...AUDIT, '--fail-on-new-token-debt');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--fail-on-new-token-debt requires --since-baseline/);
});

test('var(--space-7) is a missing-token finding under --report-missing-tokens only', () => {
  const dir = dtcgProject();
  fs.writeFileSync(path.join(dir, 'app', 'hero.css'), [
    '.hero {',
    '  gap: var(--space-7);',
    '  padding: var(--space-3);',
    '  /* margin: var(--space-9); */',
    '}',
    '',
  ].join('\n'));

  const plain = JSON.parse(rhythmguard(dir, ...AUDIT, '--format', 'json').stdout);
  assert.equal(plain.findings.css.filter((finding) => finding.type === 'missing-token').length, 0, 'off by default in 3.x');
  assert.deepEqual(plain.contracts.tokens.missingTokens.map((entry) => entry.token), ['--space-7', '--space-9']);

  assert.equal(rhythmguard(dir, ...AUDIT, '--write-baseline', 'b.json').status, 0);
  const reported = rhythmguard(dir, ...AUDIT, '--report-missing-tokens', '--since-baseline', 'b.json', '--fail-on-new-drift', '--format', 'json');
  assert.equal(reported.status, 1, 'a missing token is drift');
  const report = JSON.parse(reported.stdout);
  const missing = report.findings.css.filter((finding) => finding.type === 'missing-token');
  assert.deepEqual(missing.map(({ file, line, column, property, rule, value }) => ({ column, file, line, property, rule, value })), [
    { column: 8, file: 'app/hero.css', line: 2, property: 'gap', rule: 'rhythmguard/missing-token', value: '--space-7' },
  ], 'one finding, at the var(); the commented-out --space-9 is not one');
  assert.equal(report.summary.totalFindings, plain.summary.totalFindings + 1);
  assert.equal(report.baseline.newDriftCount, 1);
  assert.ok(!report.contracts.tokens.rawValueCandidates.some((entry) => entry.value === '--space-7'), 'a token name is not a raw value');

  const text = rhythmguard(dir, ...AUDIT, '--report-missing-tokens');
  assert.match(text.stdout, /MISSING TOKENS IN USE/);
  assert.match(text.stdout, /app\/hero\.css:2:8 {2}Token "--space-7" is used but not defined/);

  // The rc key does the same.
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { reportMissingTokens: true } }));
  const fromRc = JSON.parse(rhythmguard(dir, ...AUDIT, '--format', 'json').stdout);
  assert.equal(fromRc.findings.css.filter((finding) => finding.type === 'missing-token').length, 1);
});

test('a token a skipped vendored stylesheet defines is not a missing token', () => {
  const dir = dtcgProject();
  fs.mkdirSync(path.join(dir, 'vendor'));
  fs.writeFileSync(path.join(dir, 'vendor', 'tokens.css'), ':root { --space-7: 28px; }\n');
  fs.writeFileSync(path.join(dir, 'app', 'hero.css'), '.hero { gap: var(--space-7); margin: var(--space-11); }\n');
  const report = JSON.parse(rhythmguard(dir, ...AUDIT, '--report-missing-tokens', '--format', 'json').stdout);
  assert.deepEqual(report.findings.css.filter((finding) => finding.type === 'missing-token').map((finding) => finding.value), ['--space-11']);
});
