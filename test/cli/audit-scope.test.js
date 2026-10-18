'use strict';

/**
 * What the audit counts as scanned, clean and resolved: staged content,
 * git-scoped baselines, baseline keys that do not depend on the working
 * directory, skipped and ignored stylesheets, cleanliness rounding and parse
 * errors (issues #248 to #253).
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildReport, computeScaleCleanliness } = require('../../src/audit/contract');
const { getAuditFailures } = require('../../src/audit/baseline');
const { renderText } = require('../../src/audit/render-text');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function tempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

function audit(cwd, ...args) {
  return run(cwd, 'audit', ...args);
}

function json(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function createRepo(files) {
  const dir = tempDir('rhythmguard-scope-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test User');
  git(dir, 'config', 'commit.gpgsign', 'false');
  for (const [file, text] of Object.entries(files)) {
    write(dir, file, text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test('--staged audits the staged content, not the working tree (issue #248)', () => {
  const dir = createRepo({ 'src/a.css': '.a { color: red; }\n', 'src/b.css': '.b { color: red; }\n' });

  // Staged drift, then a clean working copy on top: the commit would carry the drift.
  write(dir, 'src/a.css', '.a { padding: 13px; }\n');
  git(dir, 'add', 'src/a.css');
  write(dir, 'src/a.css', '.a { color: blue; }\n');

  // Staged clean, then drift in the working copy only: the commit is clean.
  write(dir, 'src/b.css', '.b { color: green; }\n');
  git(dir, 'add', 'src/b.css');
  write(dir, 'src/b.css', '.b { padding: 21px; }\n');

  const result = audit(dir, './src', '--staged', '--max-findings', '0', '--format', 'json-v1');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /total findings 2 exceeds --max-findings 0/);
  const report = json(result);
  assert.equal(report.cssFilesScanned, 2);
  assert.deepEqual(
    report.findings.css.map((finding) => [finding.file, finding.value, finding.property]),
    [['src/a.css', '13px', 'padding'], ['src/a.css', '13px', 'padding']],
  );
});

test('--staged audits a staged file that is gone from the working tree, and staged template files (issue #248)', () => {
  const dir = createRepo({ 'src/keep.css': '.k { color: red; }\n' });
  write(dir, 'src/gone.css', '.g { margin: 13px; }\n');
  write(dir, 'src/Card.tsx', 'export const Card = <div className="p-[13px]" />;\n');
  git(dir, 'add', '-A');
  fs.rmSync(path.join(dir, 'src', 'gone.css'));
  write(dir, 'src/Card.tsx', 'export const Card = <div className="p-4" />;\n');

  const report = json(audit(dir, './src', '--staged', '--format', 'json-v1'));
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.templateFilesScanned, 1);
  assert.deepEqual(report.findings.css.map((finding) => finding.file), ['src/gone.css', 'src/gone.css']);
  assert.deepEqual(report.findings.tailwind.map((finding) => finding.token), ['p-[13px]']);
});

function createTwoFileRepo() {
  return createRepo({ 'src/a.css': '.a { padding: 13px; }\n', 'src/b.css': '.b { padding: 13px; }\n' });
}

test('a --staged --since-baseline run counts resolved findings only in the files it scanned (issue #249)', () => {
  const dir = createTwoFileRepo();
  assert.equal(audit(dir, './src', '--write-baseline').status, 0);
  write(dir, 'src/a.css', '.a { color: blue; }\n');
  git(dir, 'add', 'src/a.css');

  const staged = json(audit(dir, './src', '--staged', '--since-baseline', '--format', 'json'));
  assert.equal(staged.baseline.baselineFindings, 4);
  assert.equal(staged.baseline.resolvedFindingsCount, 2, 'only a.css was scanned; b.css findings are not resolved');
  assert.equal(staged.baseline.newFindingsCount, 0);

  const since = json(audit(dir, './src', '--since', 'HEAD', '--since-baseline', '--format', 'json'));
  assert.equal(since.baseline.resolvedFindingsCount, 2);
  assert.equal(since.baseline.newFindingsCount, 0);
});

test('a --staged --write-baseline run keeps the entries for files it did not scan (issue #249)', () => {
  const dir = createTwoFileRepo();
  assert.equal(audit(dir, './src', '--write-baseline').status, 0);
  write(dir, 'src/a.css', '.a { padding: 13px; margin: 21px; }\n');
  git(dir, 'add', 'src/a.css');

  const written = audit(dir, './src', '--staged', '--write-baseline', '--format', 'json-v1');
  assert.equal(written.status, 0, written.stderr);
  assert.equal(json(written).baselineWritten.findings, 6, 'four for a.css, two kept for b.css');
  const baseline = JSON.parse(fs.readFileSync(path.join(dir, '.rhythmguard-baseline.json'), 'utf8'));
  assert.deepEqual(
    [...new Set(baseline.findings.map((finding) => finding.file))].sort(),
    ['src/a.css', 'src/b.css'],
  );

  const full = audit(dir, './src', '--since-baseline', '--fail-on-new-drift', '--format', 'json');
  assert.equal(full.status, 0, full.stderr);
  assert.equal(json(full).baseline.newFindingsCount, 0);
  assert.equal(json(full).baseline.resolvedFindingsCount, 0);
});

test('a scoped --write-baseline refuses to merge into a formatVersion 1 baseline (issue #249)', () => {
  const dir = createTwoFileRepo();
  write(dir, '.rhythmguard-baseline.json', JSON.stringify({ findings: [], formatVersion: 1 }));
  write(dir, 'src/a.css', '.a { padding: 21px; }\n');
  git(dir, 'add', 'src/a.css');

  const result = audit(dir, './src', '--staged', '--write-baseline');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /formatVersion 1/);
});

test('baseline keys do not depend on the directory the command runs from (issue #252)', () => {
  const plain = tempDir('rhythmguard-keys-');
  write(plain, 'web/src/a.css', '.a { padding: 13px; }\n');
  assert.equal(audit(plain, 'web/src', '--write-baseline', 'web/.rhythmguard-baseline.json').status, 0);
  const fromWeb = audit(path.join(plain, 'web'), './src', '--since-baseline', '--fail-on-new-drift', '--format', 'json');
  assert.equal(fromWeb.status, 0, fromWeb.stderr);
  assert.equal(json(fromWeb).baseline.newFindingsCount, 0);
  assert.equal(json(fromWeb).baseline.resolvedFindingsCount, 0);

  const repo = createRepo({ 'pkg/src/a.css': '.a { padding: 13px; }\n' });
  assert.equal(audit(repo, 'pkg/src', '--write-baseline').status, 0);
  const written = JSON.parse(fs.readFileSync(path.join(repo, '.rhythmguard-baseline.json'), 'utf8'));
  assert.equal(written.formatVersion, 3);
  assert.deepEqual([...new Set(written.findings.map((finding) => finding.file))], ['pkg/src/a.css'], 'files are named from the repository root');
  const fromSrc = audit(path.join(repo, 'pkg', 'src'), '.', '--since-baseline', '../../.rhythmguard-baseline.json', '--fail-on-new-drift', '--format', 'json');
  assert.equal(fromSrc.status, 0, fromSrc.stderr);
  assert.equal(json(fromSrc).baseline.newFindingsCount, 0);
  assert.equal(json(fromSrc).baseline.resolvedFindingsCount, 0);
});

/** A baseline as 3.11.0 wrote it: formatVersion 2, files relative to the directory it ran from. */
function writeVersion2Baseline(cwd, dir, baselinePath) {
  const report = json(audit(cwd, dir, '--format', 'json-v1'));
  const seen = new Map();
  const findings = [...report.findings.css, ...report.findings.motion, ...report.findings.tailwind].map((finding) => {
    const identity = [finding.rule || '', finding.type || '', finding.file || '', finding.property || finding.token || '', finding.value || finding.rawValue || ''].join('\u001f');
    const occurrence = seen.get(identity) || 0;
    seen.set(identity, occurrence + 1);
    return { column: finding.column, file: finding.file, key: `${identity}\u001f${occurrence}`, line: finding.line, property: finding.property || undefined, rule: finding.rule, text: finding.text, type: finding.type, value: finding.value };
  });
  fs.writeFileSync(path.join(cwd, baselinePath), JSON.stringify({ createdAt: '2026-10-18T00:00:00.000Z', directory: dir, findings, formatVersion: 2 }));
  return findings;
}

test('a 3.11.0 baseline (formatVersion 2) still matches, from the directory it was written in and from another (issue #252)', () => {
  const dir = tempDir('rhythmguard-keys-v2-');
  write(dir, 'web/src/a.css', '.a { padding: 13px; }\n.b { margin: 13px; }\n');
  const findings = writeVersion2Baseline(dir, 'web/src', 'web/.rhythmguard-baseline.json');
  assert.equal(findings[0].file, 'web/src/a.css', 'the fixture is keyed as 3.11.0 keyed it');

  const sameDir = audit(dir, 'web/src', '--since-baseline', 'web/.rhythmguard-baseline.json', '--fail-on-new-drift', '--format', 'json');
  assert.equal(sameDir.status, 0, sameDir.stderr);
  assert.equal(json(sameDir).baseline.newFindingsCount, 0);

  const otherDir = audit(path.join(dir, 'web'), './src', '--since-baseline', '--fail-on-new-drift', '--format', 'json');
  assert.equal(otherDir.status, 0, otherDir.stderr);
  assert.equal(json(otherDir).baseline.newFindingsCount, 0);
  assert.equal(json(otherDir).baseline.resolvedFindingsCount, 0);

  // Real changes still show: one fixed, one added.
  write(dir, 'web/src/a.css', '.a { color: blue; }\n.b { margin: 13px; }\n.c { gap: 21px; }\n');
  const changed = json(audit(path.join(dir, 'web'), './src', '--since-baseline', '--format', 'json'));
  assert.equal(changed.baseline.resolvedFindingsCount, 2);
  assert.equal(changed.baseline.newFindingsCount, 2);

  // The next write upgrades the file to formatVersion 3.
  assert.equal(audit(path.join(dir, 'web'), './src', '--write-baseline').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'web', '.rhythmguard-baseline.json'), 'utf8')).formatVersion, 3);
});

test('a scoped write merges into a 3.11.0 baseline and upgrades it (issues #249, #252)', () => {
  const dir = createTwoFileRepo();
  writeVersion2Baseline(dir, './src', '.rhythmguard-baseline.json');
  write(dir, 'src/a.css', '.a { color: blue; }\n');
  git(dir, 'add', 'src/a.css');

  assert.equal(audit(dir, './src', '--staged', '--write-baseline').status, 0);
  const baseline = JSON.parse(fs.readFileSync(path.join(dir, '.rhythmguard-baseline.json'), 'utf8'));
  assert.equal(baseline.formatVersion, 3);
  assert.deepEqual(baseline.findings.map((finding) => finding.file), ['src/b.css', 'src/b.css']);
  const full = audit(dir, './src', '--since-baseline', '--fail-on-new-drift', '--format', 'json');
  assert.equal(full.status, 0, full.stderr);
  assert.equal(json(full).baseline.resolvedFindingsCount, 0);
});

test('stylesheets excluded by .stylelintignore are neither scanned nor clean (issue #250)', () => {
  const dir = tempDir('rhythmguard-ignored-');
  write(dir, 'src/a.css', '.a { padding: 13px; }\n');
  write(dir, 'src/ignored.css', '.i { color: red; }\n');
  write(dir, 'src/also-ignored.css', '.j { padding: 21px; }\n');
  write(dir, '.stylelintignore', 'src/ignored.css\nsrc/also-ignored.css\n');

  const result = audit(dir, './src', '--format', 'json');
  const report = json(result);
  assert.equal(report.scanned.cssFiles, 1);
  assert.equal(report.scanned.stylelintIgnored, 2);
  assert.equal(report.scanned.totalFiles, 1);
  assert.equal(report.summary.scaleCleanliness, 0, 'the one audited file has drift; the ignored ones do not dilute it');

  const text = audit(dir, './src').stdout;
  assert.match(text, /CSS files scanned\s+1\n/);

  const quickstart = run(dir);
  assert.equal(quickstart.status, 0, quickstart.stderr);
  assert.match(quickstart.stdout, /Skipped\s+2 not audited \(2 in \.stylelintignore\)/);
  assert.match(quickstart.stdout, /Cleanliness\s+0%/);
});

test('SCSS files skipped for want of postcss-scss are neither scanned nor clean (issue #250)', () => {
  const report = buildReport({
    cssFiles: ['/p/src/a.scss', '/p/src/b.scss', '/p/src/c.css'],
    cssFindings: [{ file: 'src/c.css', type: 'off-scale', value: '13px' }],
    dir: './src',
    externalTokenDefinitions: new Map(),
    motionFindings: [],
    readSource: () => '',
    scanScope: { mode: 'full' },
    scssFiles: 2,
    scssSkipped: 2,
    tailwindFindings: [],
    templateFiles: [],
    tokenCandidateMinCount: 2,
    tokenKind: 'spacing',
    tokenSourceReports: [],
    tokenSourceWarnings: [],
  });
  assert.equal(report.cssFilesScanned, 1);
  assert.equal(report.scanned.cssFiles, 1);
  assert.equal(report.totalFiles, 1);
  assert.equal(report.scaleCleanliness, 0);
  assert.match(renderText(report), /CSS files scanned\s+1\n[\s\S]*SCSS files skipped\s+2/);
});

test('cleanliness is rounded down and --min-cleanliness gates on the exact value (issue #251)', () => {
  assert.equal(computeScaleCleanliness({ filesWithIssues: 1, totalFiles: 201 }), (200 * 100) / 201);
  assert.equal(Math.floor(computeScaleCleanliness({ filesWithIssues: 71, totalFiles: 100 })), 29, 'no float error in 29/100');
  assert.equal(computeScaleCleanliness({ filesWithIssues: 0, totalFiles: 0 }), 100);

  const report = { filesWithIssues: 1, findings: { parseErrors: [] }, scaleCleanliness: 99, totalFiles: 200, totalWarnings: 1 };
  assert.deepEqual(getAuditFailures(report, { maxFindings: null, minCleanliness: 99.5 }), []);
  assert.deepEqual(getAuditFailures(report, { maxFindings: null, minCleanliness: 99.6 }), ['scale cleanliness 99% is below --min-cleanliness 99.6%']);

  const dir = tempDir('rhythmguard-rounding-');
  for (let index = 0; index < 200; index++) {
    write(dir, `src/f${index}.css`, '.a { color: red; }\n');
  }
  write(dir, 'src/bad.css', '.a { padding: 13px; }\n');
  const result = audit(dir, './src', '--min-cleanliness', '100');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Scale cleanliness\s+\S+\s+99%/);
  assert.match(result.stderr, /scale cleanliness 99% is below --min-cleanliness 100%/);
  const badge = JSON.parse(audit(dir, './src', '--format', 'badge').stdout);
  assert.equal(badge.message, '1%');
});

test('a stylesheet that fails to parse is reported as a parse error, not as drift (issue #253)', () => {
  const dir = tempDir('rhythmguard-parse-');
  write(dir, 'src/broken.css', '.a { padding: 13px;\n.b { color: red');
  write(dir, 'src/clean.css', '.c { color: green; }\n');

  const result = audit(dir, './src', '--max-findings', '0', '--min-cleanliness', '100', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = json(result);
  assert.equal(report.summary.parseErrors, 1);
  assert.equal(report.summary.totalFindings, 0);
  assert.equal(report.summary.filesWithIssues, 0);
  assert.equal(report.summary.scaleCleanliness, 100, 'the file that parsed is clean; the broken one is not counted');
  assert.deepEqual(report.findings.css, []);
  assert.deepEqual(report.contracts.scale.offScaleValues, {});
  assert.deepEqual(report.findings.parseErrors, [{
    column: 1,
    file: 'src/broken.css',
    line: 2,
    property: null,
    rule: 'CssSyntaxError',
    text: 'Unclosed block (CssSyntaxError)',
    type: 'parse-error',
    value: null,
  }]);

  const text = audit(dir, './src').stdout;
  assert.match(text, /Parse errors\s+1 {2}\(not audited\)/);
  assert.match(text, /PARSE ERRORS[\s\S]*src\/broken\.css:2:1 {2}Unclosed block \(CssSyntaxError\)/);
  assert.doesNotMatch(text, /No issues found/);

  const markdown = audit(dir, './src', '--format', 'markdown').stdout;
  assert.match(markdown, /\| Stylesheets that failed to parse \(not audited\) \| 1 \|/);
  assert.match(markdown, /## Parse Errors[\s\S]*\| `src\/broken\.css:2:1` \| Unclosed block \(CssSyntaxError\) \|/);

  const github = audit(dir, './src', '--format', 'github').stdout;
  assert.match(github, /^::error file=src\/broken\.css,line=2,col=1,title=CssSyntaxError::Not audited: Unclosed block \(CssSyntaxError\)$/m);

  const schema = json(audit(dir, '--schema'));
  assert.equal(schema.properties.summary.properties.parseErrors.type, 'integer');
  assert.equal(schema.properties.findings.properties.parseErrors.items.properties.type.const, 'parse-error');
});

test('a baseline finding in a file that no longer parses is not counted as resolved (issue #253)', () => {
  const dir = tempDir('rhythmguard-parse-baseline-');
  write(dir, 'src/a.css', '.a { padding: 13px; }\n');
  assert.equal(audit(dir, './src', '--write-baseline').status, 0);
  write(dir, 'src/a.css', '.a { padding: 13px;\n.b { color: red');

  const report = json(audit(dir, './src', '--since-baseline', '--format', 'json'));
  assert.equal(report.baseline.resolvedFindingsCount, 0);
  assert.equal(report.baseline.newFindingsCount, 0);
});
