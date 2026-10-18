'use strict';

/**
 * Contract tests for the audit option table: each entry is documented, each
 * kind parses the three spellings a user can type, and the parser refuses what
 * it does not know instead of guessing.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { HELP, OPTIONS, parseArgs, parseNonNegativeInteger, parsePercentage } = require('../../src/audit/args');

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

test('numeric options refuse empty, whitespace and non-decimal values instead of reading them as numbers (#282)', () => {
  for (const flag of ['--max-findings', '--min-cleanliness', '--token-candidate-min-count', '--base-font-size']) {
    for (const raw of ['', ' ', ' 3', '3 ', '0x10', '1e1', '+3', '-1', 'abc', '3px']) {
      assert.throws(() => parseArgs(['src', `${flag}=${raw}`]), new RegExp(`^Error: ${flag} must be`), `${flag}=${JSON.stringify(raw)}`);
    }
  }
  assert.throws(() => parseArgs(['src', '--max-findings']), /--max-findings must be a non-negative integer/, 'a missing value is refused too');
  assert.throws(() => parseArgs(['src', '--min-cleanliness', '']), /--min-cleanliness must be a number between 0 and 100/);

  assert.equal(parseArgs(['src', '--max-findings=0']).maxFindings, 0);
  assert.equal(parseArgs(['src', '--max-findings', '010']).maxFindings, 10, 'leading zeros are still decimal');
  assert.equal(parseArgs(['src', '--min-cleanliness=87.5']).minCleanliness, 87.5);
  assert.equal(parseArgs(['src', '--min-cleanliness=.5']).minCleanliness, 0.5);
  assert.equal(parseArgs(['src', '--base-font-size=10']).baseFontSize, 10);
  assert.equal(parseArgs(['src', '--token-candidate-min-count=3']).tokenCandidateMinCount, 3);
});

test('numeric values in .rhythmguardrc.json are JSON numbers or decimal strings (#282)', () => {
  assert.equal(parseNonNegativeInteger(5, 'maxFindings'), 5);
  assert.equal(parseNonNegativeInteger('5', 'maxFindings'), 5);
  assert.equal(parsePercentage(90, 'minCleanliness'), 90);
  for (const raw of [null, true, '', '0x10', [], {}]) {
    assert.throws(() => parseNonNegativeInteger(raw, 'maxFindings'), /maxFindings must be a non-negative integer/, JSON.stringify(raw));
    assert.throws(() => parsePercentage(raw, 'minCleanliness'), /minCleanliness must be a number between 0 and 100/, JSON.stringify(raw));
  }
});
