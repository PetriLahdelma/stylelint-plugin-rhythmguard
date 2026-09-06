'use strict';

/**
 * Contract tests for the audit option table: each entry is documented, each
 * kind parses the three spellings a user can type, and the parser refuses what
 * it does not know instead of guessing.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { HELP, OPTIONS, parseArgs } = require('../src/audit/args');

test('every option in the table is documented in the help text, and every documented flag is in the table', () => {
  for (const option of OPTIONS) {
    assert.ok(HELP.includes(`  ${option.flag}`), `${option.flag} appears in --help`);
    assert.ok(option.help, `${option.flag} has help text`);
    assert.ok(['flag', 'value', 'optional'].includes(option.kind), `${option.flag} has a known kind`);
    if (option.kind !== 'flag') assert.ok(option.value, `${option.flag} documents its value`);
  }
  const documented = [...HELP.matchAll(/^ {2}(--[a-z-]+)/gm)].map((match) => match[1]);
  assert.deepEqual(documented.sort(), OPTIONS.map((option) => option.flag).sort());
});

test('value options accept "--flag value" and "--flag=value", optional ones also stand alone', () => {
  assert.equal(parseArgs(['src', '--max-findings', '3']).maxFindings, 3);
  assert.equal(parseArgs(['src', '--max-findings=3']).maxFindings, 3);

  const bare = parseArgs(['src', '--write-baseline']);
  assert.equal(bare.writeBaseline, true);
  assert.ok(!bare.cliOptions.has('baselinePath'), 'no path consumed');

  const withPath = parseArgs(['src', '--write-baseline', 'drift.json']);
  assert.equal(withPath.baselinePath, 'drift.json');
  assert.ok(withPath.cliOptions.has('baselinePath'));

  const beforeFlag = parseArgs(['src', '--write-baseline', '--staged']);
  assert.equal(beforeFlag.writeBaseline, true);
  assert.equal(beforeFlag.staged, true, 'a following flag is not swallowed as the path');
});

test('the positional directory is the first bare argument and unknown options are refused', () => {
  assert.equal(parseArgs(['./styles', '--json']).dir, './styles');
  assert.throws(() => parseArgs(['--nope']), /Unknown option: --nope/);
  assert.throws(() => parseArgs(['src', '--format', 'yaml']), /Invalid format "yaml"/);
  assert.throws(() => parseArgs(['src', '--fail-on-new-drift']), /requires --since-baseline/);
  assert.throws(() => parseArgs(['src', '--since', 'main', '--staged']), /either --since or --staged/);
});
