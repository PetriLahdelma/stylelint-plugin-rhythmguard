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

// Issue #221: a negative token holds a negative value. It serves only a
// negative literal and is written as is; a positive literal never gets it.
test('fixWith: "token" never writes a negative token for a positive value, and writes it as is for a negative one', async () => {
  const code = ':root { --space-neg-2: -8px; }\n.a { padding: 9px; margin: -9px; }';
  const result = await lintCss({ code, rules: rule({ scale: [0, 4, 8, 12, 16] }), fix: true });
  assert.equal(result.code, ':root { --space-neg-2: -8px; }\n.a { padding: 8px; margin: var(--space-neg-2); }');

  const linted = await lintCss({ code, rules: rule({ scale: [0, 4, 8, 12, 16] }) });
  const texts = linted.warnings.map((warning) => warning.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.doesNotMatch(texts[0], /var\(--space-neg-2\)/, 'the positive padding names no negative token');
  assert.match(texts[1], /var\(--space-neg-2\) holds -8px\./);
});

test('fixWith: "token" negates a positive token for a negative value and ignores a negative token of another value', async () => {
  const result = await lintCss({
    code: ':root { --space-2: 8px; --space-neg-3: -12px; }\n.a { margin: -9px; padding: 13px; }',
    rules: rule({ scale: [0, 4, 8, 12, 16] }),
    fix: true,
  });
  assert.equal(result.code, ':root { --space-2: 8px; --space-neg-3: -12px; }\n.a { margin: calc(-1 * var(--space-2)); padding: 12px; }');
});

test('prefer-token keeps a negative token for negative values and a positive one for positive values', async () => {
  const code = ':root{--space-2:8px;--space-neg-2:-8px} .a{padding:8px;margin:-8px}';
  for (const options of [{ tokenMapFromCssCustomProperties: true }, {}]) {
    const result = await lintCss({ code, rules: { 'rhythmguard/prefer-token': [true, options] }, fix: true });
    assert.equal(result.code, ':root{--space-2:8px;--space-neg-2:-8px} .a{padding:var(--space-2);margin:var(--space-neg-2)}', JSON.stringify(options));
  }
});

test('prefer-token offers no token when the only one holds the other sign', async () => {
  const code = ':root{--space-neg-2:-8px} .a{padding:8px}';
  for (const options of [{ tokenMapFromCssCustomProperties: true }, {}]) {
    const result = await lintCss({ code, rules: { 'rhythmguard/prefer-token': [true, options] }, fix: true });
    assert.equal(result.code, code, JSON.stringify(options));
  }
});

test('prefer-token writes an explicit negative tokenMap entry as is', async () => {
  const result = await lintCss({
    code: '.a { margin: -12px; }',
    rules: { 'rhythmguard/prefer-token': [true, { tokenMap: { '-12px': 'var(--space-neg-3)' } }] },
    fix: true,
  });
  assert.equal(result.code, '.a { margin: var(--space-neg-3); }');
});

// Issue #231: a token with a second value under a media query, a theme or a
// data attribute renders differently there, so a fix must not write it.
const multiValued = ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; }\n@media (min-width: 768px) { :root { --space-3: 20px; } }\n[data-density=compact] { --space-2: 6px; }\n';

test('prefer-token never writes a token that holds more than one value', async () => {
  for (const options of [{}, { tokenMapFromCssCustomProperties: true }]) {
    const code = `${multiValued}.a { padding: 20px; margin: 6px; inset: 4px; }`;
    const result = await lintCss({ code, rules: { 'rhythmguard/prefer-token': [true, options] }, fix: true });
    assert.equal(result.code, `${multiValued}.a { padding: 20px; margin: 6px; inset: var(--space-1); }`, JSON.stringify(options));
  }
});

test('fixWith: "token" never writes a token that holds more than one value', async () => {
  const result = await lintCss({
    code: `${multiValued}.a { padding: 19px; margin: 7px; inset: 5px; }`,
    rules: rule({ scale: [0, 4, 6, 8, 12, 20] }),
    fix: true,
  });
  assert.equal(result.code, `${multiValued}.a { padding: 20px; margin: 6px; inset: var(--space-1); }`);
});

// Issue #223: with unitStrategy "exact" the snapped value is in the literal's
// unit, and the token lookup has to compare it in px.
test('fixWith: "token" with unitStrategy "exact" finds the token in the literal unit', async () => {
  const code = ':root { --space-a: 0.0625rem; --space-1: 1rem; }\n.a { padding: 1.1rem; }';
  const rules = rule({ scale: ['0.5rem', '1rem', '2rem'], unitStrategy: 'exact' });
  const result = await lintCss({ code, rules, fix: true });
  assert.equal(result.code, ':root { --space-a: 0.0625rem; --space-1: 1rem; }\n.a { padding: var(--space-1); }');

  const linted = await lintCss({ code, rules });
  assert.equal(linted.warnings.length, 1);
  assert.match(linted.warnings[0].text, /var\(--space-1\) holds 1rem\./);
});

test('no-offscale-transform fixWith: "token" with unitStrategy "exact" finds the token in the literal unit', async () => {
  const result = await lintCss({
    code: ':root { --space-a: 0.0625rem; --space-1: 1rem; }\n.a { transform: translateY(1.1rem); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: ['0.5rem', '1rem', '2rem'], unitStrategy: 'exact', fixWith: 'token' }] },
    fix: true,
  });
  assert.equal(result.code, ':root { --space-a: 0.0625rem; --space-1: 1rem; }\n.a { transform: translateY(var(--space-1)); }');
});
