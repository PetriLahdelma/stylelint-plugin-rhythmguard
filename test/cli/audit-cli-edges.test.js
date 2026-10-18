'use strict';

/**
 * Audit CLI edges from the 2026-10 bug sweep: strict numeric flags, group
 * scales in --plan, Markdown escaping, symlinked files and a corrupt baseline
 * (issues #282, #283, #285, #289 and #290).
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildDecisionPlan } = require('../../src/audit/decisions');
const { markdownCode, tableCode } = require('../../src/audit/render-utils');
const { buildGroupScales } = require('../../src/core/options');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function tempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function audit(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, 'audit', ...args], { cwd, encoding: 'utf8' });
}

function json(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

test('empty and non-decimal numeric flags exit 1 with an error instead of gating at 0 (#282)', () => {
  const dir = tempDir('rhythmguard-numeric-');
  write(dir, 'src/a.css', '.a { padding: 13px; }\n');

  for (const args of [['--min-cleanliness='], ['--max-findings='], ['--max-findings', '0x10'], ['--min-cleanliness', ' ']]) {
    const result = audit(dir, 'src', ...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /must be (a non-negative integer|a number between 0 and 100)\./, args.join(' '));
    assert.equal(result.stdout, '', 'no report is printed');
  }
});

test('--plan takes nearest steps from the scale each value was checked against, and audit.scales.spacing is the reported scale (#283)', () => {
  const dir = tempDir('rhythmguard-group-scales-');
  write(dir, '.rhythmguardrc.json', JSON.stringify({ audit: { scales: { spacing: [0, 5, 10], typography: [12, 14, 16] } } }));
  write(dir, 'src/a.css', '.a { margin: 8px; font-size: 15px; padding: 15px; }\n');

  const plan = json(audit(dir, 'src', '--plan')).decisions;
  const nearest = (value, property) => plan.find((entry) => entry.value === value && entry.properties.includes(property)).nearest;
  assert.deepEqual(nearest('8px', 'margin'), ['5px', '10px']);
  assert.deepEqual(nearest('15px', 'font-size'), ['14px', '16px']);
  assert.deepEqual(nearest('15px', 'padding'), ['10px', '10px']);
  assert.equal(plan.length, 3, '15px on a font size and on a padding are two entries, one per scale');

  const report = json(audit(dir, 'src', '--format', 'json'));
  assert.deepEqual(report.contracts.scale.values, [0, 5, 10]);
  assert.equal(report.contracts.scale.source, 'explicit');
});

test('buildDecisionPlan leaves nearest empty for a group whose scale is "auto", and keeps decided values whole (#283)', () => {
  const findings = [
    { property: 'font-size', type: 'off-scale', value: '15px' },
    { property: 'font-size', type: 'off-scale', value: '15px' },
    { property: 'margin', type: 'off-scale', value: '15px' },
    { property: 'border-radius', type: 'off-scale', value: '5px' },
    { token: 'p-[15px]', type: 'off-scale', value: '15px' },
  ];
  const plan = buildDecisionPlan({
    baseFontSize: 16,
    decisions: [],
    groupScales: buildGroupScales({ radius: 'auto', typography: ['0.75rem', '1rem'] }),
    offScaleFindings: findings,
    scale: [0, 4, 8, 16],
  });
  assert.deepEqual(plan.map((entry) => [entry.value, entry.count, entry.properties, entry.nearest]), [
    ['15px', 2, ['font-size'], ['12px', '16px']],
    ['15px', 2, ['margin', 'class-string'], ['8px', '16px']],
    ['5px', 1, ['border-radius'], []],
  ]);

  const decided = buildDecisionPlan({
    baseFontSize: 16,
    decisions: [{ decision: 'allow', px: 15, value: '15px' }],
    groupScales: buildGroupScales({ typography: [12, 14, 16] }),
    offScaleFindings: findings.slice(0, 2),
    scale: [0, 4, 8, 16],
  });
  assert.deepEqual(decided, [{ count: 2, decision: 'allow', nearest: ['14px', '16px'], value: '15px' }]);
});

test('Markdown keeps tables and code spans intact for file names with pipes and backticks (#285)', () => {
  const dir = tempDir('rhythmguard-markdown-');
  write(dir, 'src/a|b.css', ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n');
  write(dir, 'src/we`ird.css', '.x { margin: 13px; }\n');

  const markdown = audit(dir, 'src', '--format', 'markdown', '--scale', 'auto').stdout;
  assert.match(markdown, /^\| Scale source \| scanned-css \(src\/a\\\|b\.css\) \|$/m);
  assert.match(markdown, /^\| ``src\/we`ird\.css`` \| 2 \|$/m);
  assert.doesNotMatch(markdown, /\\`/, 'no backslash inside a code span');
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function symlinkFixture() {
  const dir = tempDir('rhythmguard-symlinks-');
  write(dir, 'real/r.css', '.r { margin: 13px; }\n');
  write(dir, 'src/own.css', '.o { padding: 21px; }\n');
  fs.symlinkSync('../real', path.join(dir, 'src', 'linked'));
  fs.symlinkSync('../real/r.css', path.join(dir, 'src', 'l.css'));
  // Reached directly and through a link: scanned once, under its own path.
  fs.symlinkSync('own.css', path.join(dir, 'src', 'alias.css'));
  // A link back up the tree is a cycle, not an endless walk.
  fs.symlinkSync('..', path.join(dir, 'src', 'loop'));
  fs.symlinkSync('missing.css', path.join(dir, 'src', 'broken.css'));
  return dir;
}

test('the audit follows symlinked files and directories, once per file, without looping (#289)', () => {
  const dir = symlinkFixture();
  const report = json(audit(dir, 'src', '--format', 'json-v1'));
  assert.equal(report.cssFilesScanned, 2);
  assert.deepEqual(
    [...new Set(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.file))].sort(),
    ['src/l.css', 'src/own.css'],
  );
});

test('--staged follows a staged symlink and does not count its target twice (#289)', () => {
  const dir = symlinkFixture();
  fs.unlinkSync(path.join(dir, 'src', 'loop'));
  fs.unlinkSync(path.join(dir, 'src', 'broken.css'));
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');

  const report = json(audit(dir, 'src', '--staged', '--format', 'json-v1'));
  assert.deepEqual(
    [...new Set(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.file))].sort(),
    ['src/l.css', 'src/own.css'],
  );
  assert.equal(report.cssFilesScanned, 2);
});

test('an invalid baseline file is named in the error (#290)', () => {
  const dir = tempDir('rhythmguard-bad-baseline-');
  write(dir, 'src/a.css', '.a { padding: 13px; }\n');
  write(dir, '.rhythmguard-baseline.json', '{x');

  const result = audit(dir, 'src', '--since-baseline');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Invalid baseline file \.rhythmguard-baseline\.json: .*JSON/);

  git(dir, 'init', '-q');
  git(dir, 'add', 'src/a.css');
  const scoped = audit(dir, 'src', '--staged', '--write-baseline', 'drift.json');
  assert.equal(scoped.status, 0, scoped.stderr);
  write(dir, 'drift.json', 'not json');
  const merge = audit(dir, 'src', '--staged', '--write-baseline', 'drift.json');
  assert.equal(merge.status, 1);
  assert.match(merge.stderr, /^Invalid baseline file drift\.json: /);
});

test('markdownCode picks a fence longer than any backtick run and pads a value that starts or ends with one (#285)', () => {
  assert.equal(markdownCode('plain'), '`plain`');
  assert.equal(markdownCode('we`ird'), '``we`ird``');
  assert.equal(markdownCode('a``b'), '```a``b```');
  assert.equal(markdownCode('`tick'), '`` `tick ``');
  assert.equal(markdownCode(' spaced '), '`  spaced  `');
  assert.equal(markdownCode('a|b'), '`a|b`', 'outside a table a pipe is literal');
  assert.equal(tableCode('a|b'), '`a\\|b`');
  assert.equal(tableCode('line\nbreak'), '`line break`');
});
