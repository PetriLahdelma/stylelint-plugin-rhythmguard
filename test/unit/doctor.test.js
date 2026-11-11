'use strict';

/**
 * runDoctor as a function (cq-11): typed checks, no module state, no output
 * and no process exit, so it can run twice in one process for two projects.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const cli = require('../../src/cli');
const { satisfiesRange } = require('../../src/cli/doctor');
const { linkPlugin, linkStylelint, makeProject } = require('../helpers/doctor-fixtures');

function stylelintProject(scale) {
  const dir = makeProject({
    '.stylelintrc.json': JSON.stringify({ plugins: ['stylelint-plugin-rhythmguard'], rules: { 'rhythmguard/use-scale': [true, { scale }] } }),
    'src/app.css': '.card { margin: 8px; }\n',
  });
  linkStylelint(dir);
  linkPlugin(dir);
  return dir;
}

test('runDoctor returns typed checks for each cwd it is given, and writes nothing', async () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, ...rest) => {
    writes.push(String(chunk));
    return originalWrite.call(process.stdout, chunk, ...rest);
  };
  let first;
  let second;
  let empty;
  try {
    first = await cli.runDoctor({ cwd: stylelintProject([0, 4, 8, 16]) });
    second = await cli.runDoctor({ cwd: stylelintProject([0, 8, 16, 32]) });
    empty = await cli.runDoctor({ cwd: makeProject() });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.deepEqual(writes.filter((chunk) => /Rhythmguard Doctor|✓|✗/.test(chunk)), []);
  assert.equal(process.exitCode, undefined);

  assert.equal(first.ok, true, cli.formatDoctorReport(first));
  assert.equal(first.setup, 'stylelint');
  assert.equal(first.issues, 0);
  assert.deepEqual(first.scale.values, [0, 4, 8, 16]);
  assert.equal(first.scale.source, 'explicit');
  assert.equal(first.scale.label, 'the "scale" option of rhythmguard/use-scale');
  assert.deepEqual(second.scale.values, [0, 8, 16, 32]);

  // A second project does not inherit the first one's counts.
  assert.equal(empty.ok, false);
  assert.equal(empty.issues, empty.checks.filter((check) => check.status === 'fail').length);
  const missing = empty.checks.find((check) => check.id === 'stylelint-installed');
  assert.deepEqual(missing, {
    fix: 'Run: npm install --save-dev "stylelint@^16.7.0 || ^17.0.0 || ^18.0.0" stylelint-plugin-rhythmguard',
    id: 'stylelint-installed',
    message: 'stylelint not installed',
    status: 'fail',
  });
  for (const check of [...first.checks, ...empty.checks]) {
    assert.ok(['pass', 'fail', 'warn', 'skip'].includes(check.status), check.status);
    assert.equal(typeof check.id, 'string');
    assert.equal(typeof check.message, 'string');
  }
});

test('doctorSummary gives quickstart the count, the scale and each failure with its fix', async () => {
  const good = await cli.runDoctor({ cwd: stylelintProject([0, 4, 8, 16]) });
  assert.equal(
    cli.doctorSummary(good),
    'Setup check: All checks passed.\n  spacing scale 0, 4, 8, 16px, from the "scale" option of rhythmguard/use-scale',
  );

  const checks = [
    { id: 'stylelint-installed', message: 'stylelint not installed', fix: 'Run: npm install --save-dev stylelint', status: 'fail' },
    { id: 'rc-token-sources', message: 'Token source x yielded no spacing tokens', status: 'warn' },
    { id: 'rc', message: 'skipped', status: 'skip' },
  ];
  assert.equal(
    cli.doctorSummary(checks),
    'Setup check: 1 issue found (1 warning).\n  ✗ stylelint not installed\n    → Run: npm install --save-dev stylelint',
  );
});

test('formatDoctorReport prints the checks as the CLI does', () => {
  const text = cli.formatDoctorReport({
    checks: [
      { id: 'a', message: 'one', status: 'pass' },
      { fix: 'do this', id: 'b', message: 'two', status: 'fail' },
      { fix: 'maybe', id: 'c', message: 'three', status: 'warn' },
      { id: 'd', message: 'four', status: 'skip' },
    ],
    issues: 1,
    warnings: 1,
  });
  assert.equal(text, '\nRhythmguard Doctor\n\n✓ one\n✗ two\n  → do this\n! three\n  → maybe\n- four\n\n1 issue found (1 warning).\n\n');
});

test('satisfiesRange reads the peer ranges package.json uses', () => {
  const peer = '^16.7.0 || ^17.0.0 || ^18.0.0';
  assert.equal(satisfiesRange('16.7.0', peer), true);
  assert.equal(satisfiesRange('16.6.9', peer), false);
  assert.equal(satisfiesRange('17.16.0', peer), true);
  assert.equal(satisfiesRange('18.0.0', peer), true);
  assert.equal(satisfiesRange('19.0.0', peer), false);
  assert.equal(satisfiesRange('15.11.0', peer), false);
  assert.equal(satisfiesRange('18.1.0-beta.1', peer), true);
  assert.equal(satisfiesRange('0.2.5', '^0.2.3'), true);
  assert.equal(satisfiesRange('0.3.0', '^0.2.3'), false);
  assert.equal(satisfiesRange('8.57.0', '>=8.0.0'), true);
  assert.equal(satisfiesRange('9.1.0', '>= 8.0.0 < 9.0.0'), false);
  assert.equal(satisfiesRange('1.2.9', '~1.2.3'), true);
  assert.equal(satisfiesRange('not a version', peer), null);
});
