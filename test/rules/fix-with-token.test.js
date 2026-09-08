'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const rule = (extra = {}) => ({ 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16, 24], fixWith: 'token', ...extra }] });

test('fixWith: "token" writes the project token when one token matches the snapped value in the same unit', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; --space-4: 16px; }\n.a { padding: 13px; margin: -13px; gap: 0.8rem; inset: 17px; }',
    rules: rule(),
    fix: true,
  });
  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.code, ':root { --space-3: 12px; --space-4: 16px; }\n.a { padding: var(--space-3); margin: calc(-1 * var(--space-3)); gap: 0.75rem; inset: var(--space-4); }');
});

test('fixWith: "token" falls back to the literal when two tokens share the value', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; --space-md: 12px; }\n.a { padding: 13px; }',
    rules: rule(),
    fix: true,
  });
  assert.equal(result.code, ':root { --space-3: 12px; --space-md: 12px; }\n.a { padding: 12px; }');
});

test('fixWith: "token" reads tokens from scaleSources, so a file without token declarations still gets them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-fixwith-'));
  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root { --space-3: 12px; }\n');
  const result = await lintCss({
    code: '.a { padding: 13px; }',
    rules: rule({ scaleSources: [path.join(dir, 'tokens.css')] }),
    fix: true,
  });
  assert.equal(result.code, '.a { padding: var(--space-3); }');
});

test('fixWith rejects anything but "value" and "token"', async () => {
  const result = await lintCss({ code: '.a { padding: 13px; }', rules: rule({ fixWith: 'guess' }) });
  assert.equal(result.invalidOptionWarnings.length, 1);
});

test('prefer-token writes a negative token as calc(-1 * var()), never as -var()', async () => {
  const result = await lintCss({
    code: '.a { margin: -12px; }',
    rules: { 'rhythmguard/prefer-token': [true, { tokenMap: { '12px': 'var(--space-3)' } }] },
    fix: true,
  });
  assert.equal(result.code, '.a { margin: calc(-1 * var(--space-3)); }');
});
