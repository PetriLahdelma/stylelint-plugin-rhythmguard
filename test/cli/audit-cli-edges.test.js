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

const OUTSIDE_CSS = '.outside { margin: 13px; }\n';

function symlinkFixture() {
  const dir = tempDir('rhythmguard-symlinks-');
  write(dir, 'src/real/r.css', '.r { margin: 13px; }\n');
  write(dir, 'src/own.css', '.o { padding: 13px; }\n');
  // Only reachable through a link: its own directory is skipped (node_modules).
  write(dir, 'src/node_modules/shared.css', '.s { gap: 13px; }\n');
  fs.symlinkSync('node_modules/shared.css', path.join(dir, 'src', 'shared.css'));
  // Reached directly and through a link: scanned once, under its own path.
  fs.symlinkSync('real', path.join(dir, 'src', 'linked'));
  fs.symlinkSync('real/r.css', path.join(dir, 'src', 'l.css'));
  fs.symlinkSync('own.css', path.join(dir, 'src', 'alias.css'));
  // Links that leave the scanned directory are never followed.
  write(dir, 'outside/o.css', OUTSIDE_CSS);
  fs.symlinkSync('../outside/o.css', path.join(dir, 'src', 'out.css'));
  fs.symlinkSync('../outside', path.join(dir, 'src', 'outdir'));
  return dir;
}

function offScaleFiles(report) {
  return [...new Set(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.file))].sort();
}

test('the audit follows symlinks inside the directory, once per file, without looping, and never outside it (#289)', () => {
  const dir = symlinkFixture();
  // A link back up the tree is a cycle, not an endless walk; a broken link is skipped.
  fs.symlinkSync('..', path.join(dir, 'src', 'real', 'up'));
  fs.symlinkSync('missing.css', path.join(dir, 'src', 'broken.css'));

  const report = json(audit(dir, 'src', '--format', 'json-v1'));
  assert.equal(report.cssFilesScanned, 3);
  assert.deepEqual(offScaleFiles(report), ['src/own.css', 'src/real/r.css', 'src/shared.css']);
  assert.equal(report.scanned.linksOutsideRoot, 2);

  assert.match(audit(dir, 'src').stdout, /Links not followed\s+2 {2}\(they point outside the scanned directory\)/);
  assert.match(audit(dir, 'src', '--format', 'markdown').stdout, /\| Symbolic links not followed \(they point outside the scanned directory\) \| 2 \|/);
  assert.equal(json(audit(dir, '.', '--format', 'json-v1')).scanned.linksOutsideRoot, undefined, 'from the parent the same links stay inside');
});

test('--staged follows a staged symlink inside the directory, not one that leaves it, and counts a target once (#289)', () => {
  const dir = symlinkFixture();
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');

  const report = json(audit(dir, 'src', '--staged', '--format', 'json-v1'));
  assert.deepEqual(offScaleFiles(report), ['src/own.css', 'src/real/r.css', 'src/shared.css']);
  assert.equal(report.cssFilesScanned, 3);
  assert.equal(report.scanned.linksOutsideRoot, 1, 'the linked file; git lists a directory link as a link, not as its files');
});

test('fix --write never writes through a symbolic link or outside the directory (#289)', () => {
  const dir = symlinkFixture();
  const result = spawnSync(process.execPath, [cliPath, 'fix', 'src', '--value', '13px', '--to', '12px', '--write'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  assert.equal(fs.readFileSync(path.join(dir, 'outside', 'o.css'), 'utf8'), OUTSIDE_CSS, 'the file outside is byte-identical');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'node_modules', 'shared.css'), 'utf8'), '.s { gap: 13px; }\n');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'real', 'r.css'), 'utf8'), '.r { margin: 12px; }\n', 'an in-root file is rewritten at its own path');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'own.css'), 'utf8'), '.o { padding: 12px; }\n');
  assert.ok(fs.lstatSync(path.join(dir, 'src', 'shared.css')).isSymbolicLink(), 'the link is still a link');

  assert.match(result.stdout, /^2 replacements in 2 files$/m);
  assert.match(result.stdout, /^skipped src\/shared\.css: reached through a symbolic link; rewrite the file it points to instead$/m);
  assert.match(result.stdout, /^skipped src\/out\.css: symbolic link to a path outside the directory; not followed$/m);
  assert.match(result.stdout, /^skipped src\/outdir: symbolic link to a path outside the directory; not followed$/m);
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
