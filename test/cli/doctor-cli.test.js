'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

test('doctor validates rhythmguard config token sources and motion settings', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  fs.writeFileSync(
    path.join(fixtureDir, '.rhythmguardrc.json'),
    JSON.stringify({
      audit: {
        includeMotion: true,
        tokenSources: [
          { path: 'tokens.json', format: 'dtcg' },
        ],
      },
    }),
  );
  fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ spacing: { 4: { $value: '16px' } } }));

  const result = spawnSync(process.execPath, [cliPath, 'doctor'], {
    cwd: fixtureDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\.rhythmguardrc\.json audit config valid/);
  assert.match(result.stdout, /token source found/);
  assert.match(result.stdout, /motion audit config valid/);
});

function runDoctorWithRc(rc) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  fs.writeFileSync(path.join(fixtureDir, '.rhythmguardrc.json'), JSON.stringify(rc));
  const doctor = spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: fixtureDir, encoding: 'utf8' });
  const audit = spawnSync(process.execPath, [cliPath, 'audit', '.', '--format', 'json'], { cwd: fixtureDir, encoding: 'utf8' });
  return { audit, doctor };
}

test('doctor accepts a decisions-only rc file, as the audit does (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({ decisions: [{ value: '13px', decision: 'allow' }] });

  assert.equal(audit.status, 0, audit.stderr);
  assert.doesNotMatch(doctor.stdout, /audit config missing/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json audit config valid/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json decisions valid \(1 decision\)/);
});

test('doctor fails an rc file the audit rejects, with the audit\'s own messages (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({
    audit: { minCleanliness: 150, scale: [] },
    decisions: [{ value: 'abc', decision: 'maybe' }],
  });

  assert.equal(audit.status, 1);
  assert.match(audit.stderr, /minCleanliness must be a number between 0 and 100/);
  assert.equal(doctor.status, 1);
  assert.doesNotMatch(doctor.stdout, /All checks passed/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json audit config invalid: minCleanliness must be a number between 0 and 100/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json decisions invalid: Invalid Rhythmguard config: decisions\[0\]/);
});

test('doctor fails a decisions section the audit rejects even when the audit section is valid (#255)', () => {
  const { audit, doctor } = runDoctorWithRc({
    audit: { includeMotion: true },
    decisions: { value: '13px' },
  });

  assert.equal(audit.status, 1);
  assert.match(audit.stderr, /decisions must be an array/);
  assert.match(doctor.stdout, /✓ \.rhythmguardrc\.json audit config valid/);
  assert.match(doctor.stdout, /✗ \.rhythmguardrc\.json decisions invalid: Invalid Rhythmguard config: decisions must be an array\./);
  // One finding, one issue: the audit section is not reported a second time.
  assert.equal((doctor.stdout.match(/decisions must be an array/g) || []).length, 1);
});

test('doctor --help prints the usage instead of running the checks; an unknown flag is refused (#286)', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
  const help = spawnSync(process.execPath, [cliPath, 'doctor', '--help'], { cwd: fixtureDir, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage: rhythmguard doctor/);
  assert.doesNotMatch(help.stdout, /Rhythmguard Doctor/);

  const unknown = spawnSync(process.execPath, [cliPath, 'doctor', '--fix'], { cwd: fixtureDir, encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /^Unknown option: --fix\n\nUsage: rhythmguard doctor/);
  assert.equal(unknown.stdout, '');
});

test('doctor warns about a token source with no spacing tokens, whatever its format, without failing (issue #163)', () => {
  function doctor(tokenSources) {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-doctor-'));
    fs.writeFileSync(path.join(fixtureDir, '.rhythmguardrc.json'), JSON.stringify({ audit: { tokenSources } }));
    fs.writeFileSync(path.join(fixtureDir, 'colors.json'), JSON.stringify({ color: { $type: 'color', brand: { $value: { colorSpace: 'srgb', components: [0, 0, 1] } } } }));
    fs.writeFileSync(path.join(fixtureDir, 'theme.css'), 'body { margin: 0; }\n');
    fs.writeFileSync(path.join(fixtureDir, 'tokens.json'), JSON.stringify({ spacing: { 1: { $value: { value: 4, unit: 'px' } } } }));
    return spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: fixtureDir, encoding: 'utf8' });
  }
  const issuesFound = (stdout) => Number((stdout.match(/^(\d+) issues? found/m) || [])[1]);
  const hint = 'spacing tokens are read by name (space, spacing or spacer), so set a tokenPattern on this source if its tokens are named otherwise';

  const clean = doctor(['tokens.json']);
  assert.doesNotMatch(clean.stdout, /yielded no|warning/);

  const result = doctor([{ path: 'colors.json', format: 'dtcg' }, 'theme.css', 'tokens.json']);
  assert.match(result.stdout, /✓ token source found \(colors\.json\)/);
  assert.ok(result.stdout.includes(`! Token source colors.json (dtcg) yielded no spacing tokens; ${hint}.\n`), result.stdout);
  assert.ok(result.stdout.includes(`! Token source theme.css (css) yielded no spacing tokens; ${hint}.\n`), result.stdout);
  assert.doesNotMatch(result.stdout, /tokens\.json \(dtcg\) yielded/);
  // Warnings, not failures: the issue count is the one a clean token setup gets.
  assert.equal(issuesFound(result.stdout), issuesFound(clean.stdout));
  assert.equal(result.status, clean.status);
  assert.match(result.stdout, /issues? found \(2 warnings\)\./);
});
