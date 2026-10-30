'use strict';

/**
 * Vendored and built stylesheets are not audited by default (#161): path
 * segments such as vendor/ and jquery-ui/, any *.min.css, and a one-line
 * stylesheet over 5 KB. --include-non-authored audits them again.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAuditReport } = require('../../src/audit');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function write(root, file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

// A one-line built bundle over 5 KB, every rule off the scale.
function bundle() {
  return '.b{margin:13px}'.repeat(400);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-non-authored-'));
  write(root, 'src/app.css', '.app {\n  padding: 13px;\n}\n');
  write(root, 'src/one-line.css', '.small{padding:13px}');
  write(root, 'vendor/normalize.css', 'h1 {\n  margin: 0.67em 0;\n}\n');
  write(root, 'src/jquery-ui/theme.css', '.ui {\n  padding: 3px;\n}\n');
  write(root, 'public/bootstrap.min.css', '.btn{padding:6px 12px}');
  write(root, 'public/app-bundle.css', `${bundle()}\n/*# sourceMappingURL=app-bundle.css.map */\n`);
  return root;
}

function runAudit(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, 'audit', ...args], { cwd, encoding: 'utf8' });
}

const findingFiles = (report) => [...new Set(report.findings.css.map((finding) => finding.file))].sort();

test('the audit skips non-authored stylesheets by default and lists them in JSON (#161)', () => {
  const root = createFixture();
  const result = runAudit(root, '.', '--no-config', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.deepEqual(findingFiles(report), ['src/app.css', 'src/one-line.css']);
  assert.equal(report.scanned.cssFiles, 2);
  assert.equal(report.scanned.nonAuthoredSkipped, 4);
  assert.deepEqual(report.scanned.nonAuthoredFiles, [
    { file: 'public/app-bundle.css', reason: 'bundle' },
    { file: 'public/bootstrap.min.css', reason: 'minified' },
    { file: 'src/jquery-ui/theme.css', reason: 'path' },
    { file: 'vendor/normalize.css', reason: 'path' },
  ]);
});

test('--include-non-authored audits them again (#161)', () => {
  const root = createFixture();
  const result = runAudit(root, '.', '--no-config', '--format', 'json', '--include-non-authored');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.deepEqual(findingFiles(report), [
    'public/app-bundle.css',
    'public/bootstrap.min.css',
    'src/app.css',
    'src/jquery-ui/theme.css',
    'src/one-line.css',
    'vendor/normalize.css',
  ]);
  assert.equal(report.scanned.cssFiles, 6);
  assert.equal(report.scanned.nonAuthoredSkipped, 0);
  assert.deepEqual(report.scanned.nonAuthoredFiles, []);
});

test('the text and Markdown summaries say how many stylesheets were skipped (#161)', () => {
  const root = createFixture();
  const text = runAudit(root, '.', '--no-config');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^ {2}Non-authored skipped {8}4 {2}\(vendored, minified or built CSS; --include-non-authored audits them\)$/m);

  const markdown = runAudit(root, '.', '--no-config', '--format', 'markdown');
  assert.equal(markdown.status, 0, markdown.stderr);
  assert.match(markdown.stdout, /^\| Non-authored stylesheets skipped \(vendored, minified or built; --include-non-authored audits them\) \| 4 \|$/m);

  const included = runAudit(root, '.', '--no-config', '--include-non-authored');
  assert.equal(included.status, 0, included.stderr);
  assert.doesNotMatch(included.stdout, /Non-authored skipped/);
});

test('with dist as the audit root, built bundles are still skipped (#161)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-non-authored-dist-'));
  write(root, 'dist/cerulean/bootstrap.css', bundle());
  write(root, 'dist/cerulean/bootstrap.min.css', bundle());
  write(root, 'dist/cerulean/theme.css', '.theme {\n  padding: 13px;\n}\n');

  const result = runAudit(root, 'dist', '--no-config', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(findingFiles(report), ['dist/cerulean/theme.css']);
  assert.deepEqual(report.scanned.nonAuthoredFiles, [
    { file: 'dist/cerulean/bootstrap.css', reason: 'bundle' },
    { file: 'dist/cerulean/bootstrap.min.css', reason: 'minified' },
  ]);
});

test('createAuditReport takes includeNonAuthored, and .rhythmguardrc.json takes audit.includeNonAuthored (#161)', async () => {
  const root = createFixture();
  const skipped = await createAuditReport({ dir: root, noConfig: true });
  assert.equal(skipped.scanned.nonAuthoredSkipped, 4);
  assert.equal(skipped.cssFilesScanned, 2);

  const included = await createAuditReport({ dir: root, includeNonAuthored: true, noConfig: true });
  assert.equal(included.scanned.nonAuthoredSkipped, 0);
  assert.equal(included.cssFilesScanned, 6);

  write(root, 'rc.json', JSON.stringify({ audit: { includeNonAuthored: true } }));
  const fromConfig = await createAuditReport({ configPath: path.join(root, 'rc.json'), dir: root });
  assert.equal(fromConfig.cssFilesScanned, 6);

  write(root, 'bad.json', JSON.stringify({ audit: { includeNonAuthored: 'yes' } }));
  await assert.rejects(
    createAuditReport({ configPath: path.join(root, 'bad.json'), dir: root }),
    /includeNonAuthored must be a boolean/,
  );
});

test('a baseline finding in a skipped stylesheet is neither resolved nor new (#161)', () => {
  const root = createFixture();
  const baseline = path.join(root, 'baseline.json');
  const written = runAudit(root, '.', '--no-config', '--include-non-authored', '--write-baseline', baseline);
  assert.equal(written.status, 0, written.stderr);

  const compared = runAudit(root, '.', '--no-config', '--format', 'json', '--since-baseline', baseline);
  assert.equal(compared.status, 0, compared.stderr);
  const report = JSON.parse(compared.stdout);
  assert.equal(report.baseline.newFindingsCount, 0);
  assert.equal(report.baseline.resolvedFindingsCount, 0);
});
