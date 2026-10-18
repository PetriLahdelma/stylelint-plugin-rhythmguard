'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.join(__dirname, '..', '..', 'src', 'cli', 'index.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-fix-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { margin: 10px; padding: 10px 15px; }\n');
  fs.writeFileSync(path.join(dir, 'src', 'b.scss'), '.b { gap: 0.625rem; }\n');
  return dir;
}

function runFix(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, 'fix', ...args], { cwd, encoding: 'utf8' });
}

test('fix is a dry run by default: it lists every change and writes nothing', () => {
  const dir = fixture();
  const result = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /src\/a\.css:1:14\s+margin: 10px -> var\(--space-sm\)/);
  assert.match(result.stdout, /src\/b\.scss:1:11\s+gap: 0\.625rem -> var\(--space-sm\)/);
  assert.match(result.stdout, /3 replacements in 2 files \(dry run; pass --write to apply\)/);
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), '.a { margin: 10px; padding: 10px 15px; }\n');
});

test('fix --write applies the replacement and touches only the files it changed', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'src', 'c.css'), '.c { margin: 8px; }\n');
  const before = fs.statSync(path.join(dir, 'src', 'c.css')).mtimeMs;
  const result = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)', '--write');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /3 replacements in 2 files/);
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), '.a { margin: var(--space-sm); padding: var(--space-sm) 15px; }\n');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'b.scss'), 'utf8'), '.b { gap: var(--space-sm); }\n');
  assert.equal(fs.statSync(path.join(dir, 'src', 'c.css')).mtimeMs, before, 'an untouched file is not rewritten');

  const again = runFix(dir, 'src', '--value', '10px', '--to', 'var(--space-sm)', '--write');
  assert.match(again.stdout, /0 replacements/, 'idempotent');
});

test('fix --decided executes every snap decision that names its target', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    decisions: [
      { value: '10px', decision: 'snap', to: '8px' },
      { value: '15px', decision: 'snap' },
      { value: '2px', decision: 'allow' },
    ],
  }));
  const result = runFix(dir, 'src', '--decided');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /margin: 10px -> 8px/);
  assert.match(result.stdout, /1 snap decision has no "to" and was skipped: 15px/);
  assert.doesNotMatch(result.stdout, /15px ->/);
});

test('fix --decided applies every snap once, to the original values, and the dry run shows what --write writes (#256)', () => {
  const dir = emptyFixture();
  fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { padding: 10px; margin: 14px; }\n');
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    decisions: [
      { value: '10px', decision: 'snap', to: '14px' },
      { value: '14px', decision: 'snap', to: '16px' },
    ],
  }));

  const dry = runFix(dir, 'src', '--decided');
  assert.equal(dry.status, 0, dry.stderr);
  const write = runFix(dir, 'src', '--decided', '--write');
  assert.equal(write.status, 0, write.stderr);

  assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), '.a { padding: 14px; margin: 16px; }\n');
  const changes = (output) => output.split('\n').filter((line) => line.includes(' -> '));
  assert.deepEqual(changes(write.stdout), [
    '  src/a.css:1:15  padding: 10px -> 14px',
    '  src/a.css:1:29  margin: 14px -> 16px',
  ]);
  assert.deepEqual(changes(dry.stdout), changes(write.stdout));
  assert.match(write.stdout, /2 replacements in 1 file\n/);
  assert.match(dry.stdout, /2 replacements in 1 file \(dry run/);
});

test('fix refuses an unparsable value or a missing target', () => {
  const dir = fixture();
  assert.equal(runFix(dir, 'src', '--value', 'lots', '--to', '8px').status, 1);
  const missing = runFix(dir, 'src', '--value', '10px');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--to/);
});

function emptyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-fix-'));
  fs.mkdirSync(path.join(dir, 'src'));
  return dir;
}

test('fix leaves SCSS // comments byte-identical and rewrites only real declarations (#229)', () => {
  const dir = emptyFixture();
  fs.writeFileSync(path.join(dir, 'src', 'a.scss'), '// old: .card { padding: 10px; }\n.card { padding: 10px; }\n');

  const dry = runFix(dir, 'src', '--value', '10px', '--to', '8px');
  assert.equal(dry.status, 0, dry.stderr);
  assert.doesNotMatch(dry.stdout, /a\.scss:1:/, 'nothing on the comment line is listed');
  assert.match(dry.stdout, /src\/a\.scss:2:18\s+padding: 10px -> 8px/);
  assert.match(dry.stdout, /1 replacement in 1 file \(dry run/);

  const write = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--write');
  assert.equal(write.status, 0, write.stderr);
  assert.match(write.stdout, /src\/a\.scss:2:18\s+padding: 10px -> 8px/);
  assert.match(write.stdout, /1 replacement in 1 file\n/);
  assert.equal(
    fs.readFileSync(path.join(dir, 'src', 'a.scss'), 'utf8'),
    '// old: .card { padding: 10px; }\n.card { padding: 8px; }\n',
  );
});

test('fix rewrites valid SCSS with a // comment inside a rule instead of skipping it (#229)', () => {
  const dir = emptyFixture();
  fs.writeFileSync(path.join(dir, 'src', 'b.scss'), '.a {\n  // note\n  padding: 10px;\n  .b { margin: 10px; }\n}\n');

  const dry = runFix(dir, 'src', '--value', '10px', '--to', '8px');
  assert.equal(dry.status, 0, dry.stderr);
  assert.doesNotMatch(dry.stdout, /skipped/);
  assert.match(dry.stdout, /src\/b\.scss:3:12\s+padding: 10px -> 8px/);
  assert.match(dry.stdout, /src\/b\.scss:4:16\s+margin: 10px -> 8px/);
  assert.match(dry.stdout, /2 replacements in 1 file \(dry run/);

  const write = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--write');
  assert.equal(write.status, 0, write.stderr);
  assert.doesNotMatch(write.stdout, /skipped/);
  assert.equal(
    fs.readFileSync(path.join(dir, 'src', 'b.scss'), 'utf8'),
    '.a {\n  // note\n  padding: 8px;\n  .b { margin: 8px; }\n}\n',
  );
});

test('fix skips SCSS with a clear message when postcss-scss cannot be resolved, never parsing it as CSS (#229)', () => {
  const dir = emptyFixture();
  const scss = '// old: .card { padding: 10px; }\n.card { padding: 10px; }\n';
  fs.writeFileSync(path.join(dir, 'src', 'a.scss'), scss);
  fs.writeFileSync(path.join(dir, 'src', 'c.css'), '.c { padding: 10px; }\n');
  const hide = path.join(dir, 'hide-postcss-scss.js');
  fs.writeFileSync(hide, [
    "const Module = require('node:module');",
    'const original = Module._resolveFilename;',
    'Module._resolveFilename = function (request, ...rest) {',
    "  if (request === 'postcss-scss') { const error = new Error('Cannot find module postcss-scss'); error.code = 'MODULE_NOT_FOUND'; throw error; }",
    '  return original.call(this, request, ...rest);',
    '};',
    '',
  ].join('\n'));

  for (const write of [[], ['--write']]) {
    const result = spawnSync(process.execPath, ['--require', hide, cliPath, 'fix', 'src', '--value', '10px', '--to', '8px', ...write], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 replacement in 1 file/);
    assert.doesNotMatch(result.stdout, /a\.scss:\d/);
    assert.match(result.stdout, /skipped src\/a\.scss: postcss-scss is not installed; install it to rewrite SCSS/);
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.scss'), 'utf8'), scss);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'c.css'), 'utf8'), '.c { padding: 8px; }\n');
});

const IGNORE_FIXTURE_FILES = ['src/a.css', 'src/custom/c.css', 'src/legacy/l.css', 'src/vendor/v.css', 'src/generated/g.css', 'src/dist/d.css', 'src/node_modules/pkg/n.css'];

function ignoreFixture() {
  const dir = emptyFixture();
  for (const file of IGNORE_FIXTURE_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), '.x { padding: 10px; }\n');
  }
  fs.writeFileSync(path.join(dir, '.rhythmguardignore'), '# hand-written legacy\nlegacy\n');
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { ignore: ['vendor/**'] } }));
  return dir;
}

for (const write of [false, true]) {
  test(`fix${write ? ' --write' : ''} skips what the audit ignores: .rhythmguardignore, audit.ignore, --ignore and generated directories (#230)`, () => {
    const dir = ignoreFixture();
    const result = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--ignore', 'generated', ...(write ? ['--write'] : []));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /src\/a\.css:1:/);
    assert.match(result.stdout, /src\/custom\/c\.css:1:/);
    assert.doesNotMatch(result.stdout, /legacy|vendor|generated|dist|node_modules/);
    assert.match(result.stdout, write ? /2 replacements in 2 files\n/ : /2 replacements in 2 files \(dry run/);
    for (const file of IGNORE_FIXTURE_FILES.slice(2)) {
      assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), '.x { padding: 10px; }\n', `${file} is untouched`);
    }
    const expected = write ? '.x { padding: 8px; }\n' : '.x { padding: 10px; }\n';
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.css'), 'utf8'), expected);
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'custom', 'c.css'), 'utf8'), expected);
  });
}

test('fix --ignore-path reads another ignore file instead of .rhythmguardignore, as the audit does (#230)', () => {
  const dir = ignoreFixture();
  fs.writeFileSync(path.join(dir, 'other-ignore'), 'custom\n');
  const result = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--ignore-path', 'other-ignore', '--write');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /src\/legacy\/l\.css:1:/);
  assert.doesNotMatch(result.stdout, /custom|vendor/);
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'custom', 'c.css'), 'utf8'), '.x { padding: 10px; }\n');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'vendor', 'v.css'), 'utf8'), '.x { padding: 10px; }\n');

  const missing = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--ignore-path', 'nope');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Ignore file not found: nope/);
});

test('fix looks at the same files the audit scans (#230)', () => {
  const dir = ignoreFixture();
  const audit = spawnSync(process.execPath, [cliPath, 'audit', 'src', '--json', '--ignore', 'generated'], { cwd: dir, encoding: 'utf8' });
  assert.equal(audit.status, 0, audit.stderr);
  const auditFiles = [...new Set(JSON.parse(audit.stdout).findings.css.map((finding) => finding.file))].sort();
  const fix = runFix(dir, 'src', '--value', '10px', '--to', '8px', '--ignore', 'generated');
  const fixFiles = Array.from(fix.stdout.matchAll(/^ {2}(\S+?):\d+:\d+/gm), (match) => match[1]).sort();
  assert.deepEqual(fixFiles, auditFiles);
  assert.deepEqual(fixFiles, ['src/a.css', 'src/custom/c.css']);
});
