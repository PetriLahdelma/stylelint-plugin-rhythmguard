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
