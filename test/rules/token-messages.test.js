'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const preferToken = (extra = {}) => ({
  'rhythmguard/prefer-token': [true, { scale: [0, 4, 8, 12, 16, 24, 32], ...extra }],
});

test('prefer-token names the token it would write', async () => {
  const result = await lintCss({
    code: '.a { gap: 12px; margin: -12px; }',
    rules: preferToken({ tokenMap: { '12px': 'var(--space-3)' } }),
  });
  assert.deepEqual(result.warnings.map((w) => w.text), [
    'Unexpected raw scale value "12px". Use var(--space-3). (rhythmguard/prefer-token)',
    'Unexpected raw scale value "-12px". Use calc(-1 * var(--space-3)). (rhythmguard/prefer-token)',
  ]);
});

test('prefer-token says when no known token holds the value', async () => {
  const result = await lintCss({
    code: '.a { gap: 13px; }',
    rules: preferToken({ tokenMap: { '12px': 'var(--space-3)' } }),
  });
  assert.equal(
    result.warnings[0].text,
    'Unexpected raw scale value "13px". No known token holds this value; use the nearest token or add one. (rhythmguard/prefer-token)',
  );
});

test('prefer-token names the stylesheet a custom property came from', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; }\n.a { gap: 12px; }',
    codeFilename: path.join(process.cwd(), 'src', 'tokens.css'),
    rules: preferToken({ tokenMapFromCssCustomProperties: true }),
  });
  assert.equal(
    result.warnings[0].text,
    'Unexpected raw scale value "12px". Use var(--space-3) (src/tokens.css). (rhythmguard/prefer-token)',
  );
});

test('prefer-token names the token map file a token came from', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-origin-'));
  const file = path.join(dir, 'tokens.json');
  fs.writeFileSync(file, JSON.stringify({ 'space-3': '12px' }));
  const result = await lintCss({
    code: '.a { gap: 12px; }',
    rules: preferToken({ tokenMapFile: file }),
  });
  assert.equal(
    result.warnings[0].text,
    `Unexpected raw scale value "12px". Use var(--space-3) (${file}). (rhythmguard/prefer-token)`,
  );
});

test('use-scale with fixWith token says which token holds the snapped value', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; }\n.a { padding: 13px; inset: 17px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16, 24], fixWith: 'token' }] },
  });
  assert.deepEqual(result.warnings.map((w) => w.text), [
    'Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). var(--space-3) holds 12px. (rhythmguard/use-scale)',
    'Unexpected off-scale value "17px". Use scale values (nearest: 16px or 24px). (rhythmguard/use-scale)',
  ]);
});

test('no-offscale-transform with fixWith token says which token holds the snapped value', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; }\n.a { transform: translateX(13px); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: [0, 4, 8, 12, 16, 24], fixWith: 'token' }] },
  });
  assert.match(result.warnings[0].text, /\(nearest: 12px or 16px\)\. var\(--space-3\) holds 12px\./);
});
