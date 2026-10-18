'use strict';

/**
 * How `scale: "auto"` and group `"auto"` scales are wired: which files they
 * read, what they say when a source fails, and what a group falls back to.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `rhythmguard-${prefix}-`));
}

async function lintIn(dir, options) {
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    return await lintCss(options);
  } finally {
    process.chdir(previousCwd);
  }
}

const texts = (result) => result.warnings.map((warning) => warning.text);

test('a missing scaleSources file is named in the fallback note (issue #270)', async () => {
  const dir = tempDir('missing-source');
  const result = await lintIn(dir, {
    code: '.a { margin: 13px; padding: 7px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: ['does-not-exist.css'] }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 2, texts(result).join('\n'));
  assert.match(
    result.warnings[0].text,
    /No spacing tokens were found for scale "auto"; using preset "rhythmic-4"\. Token source not found: does-not-exist\.css\./,
  );
  assert.doesNotMatch(result.warnings[1].text, /Token source not found/);
});

test('a token source that does not parse is named in the fallback note (issue #270)', async () => {
  const dir = tempDir('broken-source');
  fs.writeFileSync(path.join(dir, 'tokens.json'), '{ "spacing": ');
  const result = await lintIn(dir, {
    code: '.a { margin: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: ['tokens.json'] }] },
  });

  assert.equal(result.warnings.length, 1, texts(result).join('\n'));
  assert.match(result.warnings[0].text, /using preset "rhythmic-4"\. Unable to parse token source tokens\.json: /);
});

test('an invalid scaleSources format is an invalid option, not a crash (issue #265)', async () => {
  const dir = tempDir('bad-format-option');
  fs.writeFileSync(path.join(dir, 'sizes.css'), ':root { --space-1: 4px; }');
  const result = await lintIn(dir, {
    code: '.a { margin: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: [{ path: 'sizes.css', format: 'scss' }] }] },
  });

  assert.equal(result.invalidOptionWarnings.length, 1, JSON.stringify(result.invalidOptionWarnings));
  assert.match(result.invalidOptionWarnings[0].text, /option "scaleSources"/);
});

test('an invalid format in .rhythmguardrc.json becomes a warning and the lint goes on (issue #265)', async () => {
  const dir = tempDir('bad-format-rc');
  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; }');
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    audit: { tokenSources: [{ path: 'tokens.css', format: 'scss' }] },
  }));
  const result = await lintIn(dir, {
    code: '.a { margin: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto' }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, texts(result).join('\n'));
  assert.match(
    result.warnings[0].text,
    /using preset "rhythmic-4"\. \.rhythmguardrc\.json: Invalid token source format "scss"\./,
  );
});

test('an rc file that is not valid JSON is named in the fallback note (issue #265)', async () => {
  const dir = tempDir('bad-json-rc');
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), '{ "audit": ');
  const result = await lintIn(dir, {
    code: '.a { margin: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto' }] },
  });

  assert.equal(result.warnings.length, 1, texts(result).join('\n'));
  assert.match(result.warnings[0].text, /using preset "rhythmic-4"\. \.rhythmguardrc\.json could not be read: /);
});

test('the lint reads rc token sources with baseDir and file the way the audit does (issue #271)', async () => {
  const dir = tempDir('rc-basedir');
  fs.mkdirSync(path.join(dir, 'ui'));
  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root { --space-1: 3px; --space-2: 6px; --space-3: 9px; --space-4: 12px; }');
  fs.writeFileSync(path.join(dir, 'ui', 'tokens.css'), ':root { --space-1: 5px; --space-2: 10px; --space-3: 15px; --space-4: 20px; }');
  for (const entry of [{ path: 'tokens.css', baseDir: 'ui' }, { file: 'tokens.css', baseDir: 'ui' }]) {
    fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({ audit: { tokenSources: [entry] } }));
    const result = await lintIn(dir, {
      code: '.a { margin: 6px; }',
      rules: { 'rhythmguard/use-scale': [true, { scale: 'auto' }] },
    });
    assert.deepEqual(texts(result), [
      'Unexpected off-scale value "6px". Use scale values (nearest: 5px or 10px). (rhythmguard/use-scale)',
    ], JSON.stringify(entry));
  }
});

test('scales: { spacing: "auto" } without spacing tokens uses scale, not rhythmic-4 (issue #261)', async () => {
  const dir = tempDir('group-spacing-auto');
  const result = await lintIn(dir, {
    code: '.a { padding: 5px; margin: 15px; gap: 7px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 5, 10, 15, 20], scales: { spacing: 'auto' } }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(texts(result), [
    'Unexpected off-scale value "7px". Use scale values (nearest: 5px or 10px). (rhythmguard/use-scale)',
  ]);
});

test('scales: { spacing: "auto" } still reads spacing tokens when they exist', async () => {
  const dir = tempDir('group-spacing-auto-tokens');
  const result = await lintIn(dir, {
    code: ':root { --space-1: 4px; --space-2: 8px; --space-3: 16px; }\n.a { padding: 5px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 5, 10, 15, 20], scales: { spacing: 'auto' } }] },
  });

  assert.deepEqual(texts(result), [
    'Unexpected off-scale value "5px". Use spacing scale values (nearest: 4px or 8px). (rhythmguard/use-scale)',
  ]);
});

test('typography "auto" ignores Tailwind --text-*--line-height sub-tokens (issue #262)', async () => {
  const dir = tempDir('typography-subkeys');
  const result = await lintIn(dir, {
    code: [
      ':root { --text-sm: 14px; --text-base: 16px; --text-lg: 18px; --text-xl: 24px; --text-sm--line-height: 20px; --text-base--line-height: 28px; }',
      '.a { font-size: 20px; } .b { font-size: 28px; } .c { font-size: 22px; }',
    ].join('\n'),
    rules: { 'rhythmguard/use-scale': [true, { propertyGroups: ['spacing', 'typography'], scale: [0, 4, 8, 16], scales: { typography: 'auto' } }] },
  });

  assert.deepEqual(texts(result), [
    'Unexpected off-scale value "20px". Use typography scale values (nearest: 18px or 24px). (rhythmguard/use-scale)',
    'Unexpected off-scale value "28px". Use typography scale values (nearest: 24px). (rhythmguard/use-scale)',
    'Unexpected off-scale value "22px". Use typography scale values (nearest: 18px or 24px). (rhythmguard/use-scale)',
  ]);
});
