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
