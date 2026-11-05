'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const load = () => import(path.join(__dirname, '..', '..', 'scripts', 'release', 'prepare.mjs'));

test('release versions must go up and the badge key drops the dots', async () => {
  const { badgeKey, isAbove } = await load();
  assert.equal(isAbove('3.19.0', '3.18.0'), true);
  assert.equal(isAbove('3.18.0', '3.18.0'), false);
  assert.equal(isAbove('3.9.9', '3.10.0'), false);
  assert.equal(badgeKey('3.18.0'), '3180');
  assert.equal(badgeKey('3.10.2'), '3102');
  assert.throws(() => isAbove('3.19', '3.18.0'), /X\.Y\.Z/);
});

test('the changelog cut moves Unreleased under a dated heading and refuses an empty one', async () => {
  const { cutChangelog } = await load();
  const text = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- a fix\n\n## [3.18.0] - 2026-11-05\n\n- old\n';
  const { notes, text: out } = cutChangelog(text, '3.19.0', '2026-11-27');
  assert.equal(notes, '### Fixed\n\n- a fix\n');
  assert.equal(out, '# Changelog\n\n## [Unreleased]\n\n## [3.19.0] - 2026-11-27\n\n### Fixed\n\n- a fix\n\n## [3.18.0] - 2026-11-05\n\n- old\n');
  assert.throws(() => cutChangelog('## [Unreleased]\n\n## [3.18.0] - x\n', '3.19.0', 'd'), /empty/);
});

test('prepare edits every manifest, the lockfile, the badge and the changelog together', async () => {
  const { prepare } = await load();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-prepare-'));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  };
  write('package.json', { name: 'stylelint-plugin-rhythmguard', version: '3.18.0' });
  write('package-lock.json', { version: '3.18.0', packages: { '': { version: '3.18.0' } } });
  for (const dir of ['packages/rhythmguard', 'packages/eslint-plugin-rhythmguard']) {
    write(`${dir}/package.json`, { name: path.basename(dir), version: '3.18.0', dependencies: { 'stylelint-plugin-rhythmguard': '^3.18.0' } });
  }
  write('README.md', '[![npm](https://img.shields.io/npm/v/x?r=3180)](https://www.npmjs.com)\n');
  write('CHANGELOG.md', '## [Unreleased]\n\n- new\n\n## [3.18.0] - 2026-11-05\n');

  const { notes, previous } = prepare(root, { version: '3.19.0', date: '2026-11-27' });
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.equal(previous, '3.18.0');
  assert.equal(notes, '- new\n');
  assert.equal(read('package.json').version, '3.19.0');
  assert.deepEqual([read('package-lock.json').version, read('package-lock.json').packages[''].version], ['3.19.0', '3.19.0']);
  for (const dir of ['packages/rhythmguard', 'packages/eslint-plugin-rhythmguard']) {
    const companion = read(`${dir}/package.json`);
    assert.deepEqual([companion.version, companion.dependencies['stylelint-plugin-rhythmguard']], ['3.19.0', '^3.19.0']);
  }
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /r=3190\)/);
  assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /^## \[Unreleased\]\n\n## \[3\.19\.0\] - 2026-11-27\n\n- new\n/);
  assert.throws(() => prepare(root, { version: '3.19.0', date: 'x' }), /not above/);
});
