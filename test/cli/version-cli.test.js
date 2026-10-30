'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');
const packageJson = require('../../package.json');

function run(...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd: os.tmpdir(), encoding: 'utf8' });
}

test('`--version` and `-v` print the package version and exit 0 (#326)', () => {
  for (const flag of ['--version', '-v']) {
    const result = run(flag);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${packageJson.version}\n`, `${flag} prints exactly the version`);
    assert.equal(result.stderr, '');
  }
});

test('the version flag is listed in the help text (#326)', () => {
  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^ {2}--version {2,}.*-v does the same$/m);
  assert.doesNotMatch(help.stdout, /^ {2}-v {2,}/m, '-v is named once, on the --version line');
});
