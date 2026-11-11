'use strict';

/**
 * Token fixes never guess and never leave a token's scope (css-08, fix-06,
 * fix-02). Two tokens holding one value are named, never chosen between, on
 * every token path: the custom-property map, `tokenMapFile`, the Tailwind
 * map, the token index and use-scale's `fixWith: "token"`. A token declared
 * in a component block or under `@media`, `@supports` or `@container` is
 * written only where it is defined, and no token is written into a var()
 * fallback.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const SCALE = [0, 4, 8, 12, 16, 24];
const useScale = (extra = {}) => ({ 'rhythmguard/use-scale': [true, { scale: SCALE, fixWith: 'token', ...extra }] });
const transform = (extra = {}) => ({ 'rhythmguard/no-offscale-transform': [true, { scale: SCALE, fixWith: 'token', ...extra }] });
const preferToken = (extra = {}) => ({ 'rhythmguard/prefer-token': [true, extra] });
const MAP = { tokenMapFromCssCustomProperties: true };

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-token-scope-'));
}

async function fixed(code, rules) {
  return (await lintCss({ code, fix: true, rules })).code;
}

async function texts(code, rules) {
  return (await lintCss({ code, rules })).warnings.map((warning) => warning.text);
}

// Two tokens, one value.

test('two same-valued tokens are named and never written, on the map path as on the index path (css-08)', async () => {
  const code = ':root { --spacing-3: 12px; --spacing-gutter: 12px; }\n.a { padding: 12px; }';
  const expected = 'Unexpected raw scale value "12px". Use one of the tokens that hold it: var(--spacing-3) or var(--spacing-gutter). (rhythmguard/prefer-token)';
  for (const options of [{}, MAP]) {
    const rules = preferToken({ tokenPattern: '^--spacing-', ...options });
    assert.equal(await fixed(code, rules), code, JSON.stringify(options));
    assert.deepEqual(await texts(code, rules), [expected], JSON.stringify(options));
  }
});

test('the map path still writes a value exactly one token holds', async () => {
  const code = ':root { --spacing-3: 12px; --spacing-gutter: 24px; }\n.a { padding: 12px; }';
  const rules = preferToken({ tokenPattern: '^--spacing-', ...MAP });
  assert.equal(await fixed(code, rules), ':root { --spacing-3: 12px; --spacing-gutter: 24px; }\n.a { padding: var(--spacing-3); }');
});

test('the map path prefers the token in the literal\'s unit, as the index does', async () => {
  const code = ':root { --space-4: 1rem; --space-md: 16px; }\n.a { padding: 16px; margin: 1rem; }';
  for (const options of [{}, MAP]) {
    assert.equal(await fixed(code, preferToken(options)), ':root { --space-4: 1rem; --space-md: 16px; }\n.a { padding: var(--space-md); margin: var(--space-4); }', JSON.stringify(options));
  }
});

test('the tailwind config never writes one of two same-valued tokens, and a use-scale snap is not laundered into one (fix-06)', async () => {
  const code = ':root { --spacing-gutter: 24px; --spacing-layout: 24px; }\n.a { margin: 24px; padding: 23px; }';
  const { default: stylelint } = await import('stylelint');
  const result = await stylelint.lint({
    code,
    codeFilename: path.join(tempDir(), 'a.css'),
    config: { extends: [path.join(__dirname, '..', '..', 'src', 'configs', 'tailwind.js')] },
    configBasedir: path.join(__dirname, '..', '..'),
    fix: true,
  });
  assert.equal(result.code, ':root { --spacing-gutter: 24px; --spacing-layout: 24px; }\n.a { margin: 24px; padding: 24px; }');
});

test('a tokenMapFile with two tokens for one value names both and writes neither (fix-06)', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'tokens.json');
  fs.writeFileSync(file, JSON.stringify({ space: { 3: { $value: '12px' }, gutter: { $value: '12px' }, 4: { $value: '16px' } } }));
  const code = '.a { padding: 12px; margin: 16px; }';
  const rules = preferToken({ tokenMapFile: file });
  assert.equal(await fixed(code, rules), '.a { padding: 12px; margin: var(--space-4); }');
  const [first] = await texts(code, rules);
  assert.equal(first, 'Unexpected raw scale value "12px". Use one of the tokens that hold it: var(--space-3) or var(--space-gutter). (rhythmguard/prefer-token)');
});

test('an explicit tokenMap entry settles a value the tokenMapFile left open', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'tokens.json');
  fs.writeFileSync(file, JSON.stringify({ 'space-3': '12px', 'space-gutter': '12px' }));
  const rules = preferToken({ tokenMap: { '12px': 'var(--space-3)' }, tokenMapFile: file });
  assert.equal(await fixed('.a { padding: 12px; }', rules), '.a { padding: var(--space-3); }');
});

test('a Tailwind spacing map with two keys for one value names both and writes neither (fix-06)', async () => {
  const dir = tempDir();
  const config = path.join(dir, 'tailwind.config.js');
  fs.writeFileSync(config, "module.exports = { theme: { spacing: { 3: '12px', gutter: '12px', 4: '16px' } } };\n");
  const code = '.a { padding: 12px; margin: 16px; }';
  const rules = preferToken({ tailwindConfigPath: config, tokenMapFromTailwindSpacing: true });
  assert.equal(await fixed(code, rules), '.a { padding: 12px; margin: theme(spacing.4); }');
  const [first] = await texts(code, rules);
  assert.equal(first, 'Unexpected raw scale value "12px". Use one of the tokens that hold it: theme(spacing.3) or theme(spacing.gutter). (rhythmguard/prefer-token)');
});

// A token written only where it is defined.

const COMPONENT = ':root { --space-1: 4px; }\n.card { --space-local: 12px; }\n';

test('a component token is never written outside its block, on every path (fix-02)', async () => {
  assert.equal(await fixed(`${COMPONENT}.other { padding: 13px; }`, useScale()), `${COMPONENT}.other { padding: 12px; }`);
  assert.equal(await fixed(`${COMPONENT}.other { transform: translateX(13px); }`, transform()), `${COMPONENT}.other { transform: translateX(12px); }`);
  for (const options of [{}, MAP]) {
    const code = `${COMPONENT}.other { padding: 12px; }`;
    assert.equal(await fixed(code, preferToken(options)), code, JSON.stringify(options));
    assert.deepEqual(await texts(code, preferToken(options)), [
      'Unexpected raw scale value "12px". No known token holds this value; use the nearest token or add one. (rhythmguard/prefer-token)',
    ], JSON.stringify(options));
  }
});

test('a component token is still written inside its own block', async () => {
  const code = '.card { --space-local: 12px; padding: 13px; & .inner { transform: translateX(13px); } }';
  assert.equal(
    await fixed(code, { ...useScale(), ...transform() }),
    '.card { --space-local: 12px; padding: var(--space-local); & .inner { transform: translateX(var(--space-local)); } }',
  );
  for (const options of [{}, MAP]) {
    assert.equal(await fixed('.card { --space-local: 12px; padding: 12px; }', preferToken(options)), '.card { --space-local: 12px; padding: var(--space-local); }', JSON.stringify(options));
  }
});

const MEDIA = ':root { --space-1: 4px; }\n@media (min-width: 768px) { :root { --space-3: 12px; } }\n';

test('a token declared only under @media is never written outside it, on every path (fix-02)', async () => {
  assert.equal(await fixed(`${MEDIA}.a { padding: 13px; }`, useScale()), `${MEDIA}.a { padding: 12px; }`);
  assert.equal(await fixed(`${MEDIA}.a { transform: translateY(13px); }`, transform()), `${MEDIA}.a { transform: translateY(12px); }`);
  for (const options of [{}, MAP]) {
    const code = `${MEDIA}.a { padding: 12px; }`;
    assert.equal(await fixed(code, preferToken(options)), code, JSON.stringify(options));
  }
});

test('a token declared only under @media is written under the same condition', async () => {
  const code = `${MEDIA}@media (min-width:768px) { .a { padding: 13px; } }`;
  assert.equal(await fixed(code, useScale()), `${MEDIA}@media (min-width:768px) { .a { padding: var(--space-3); } }`);
  const other = `${MEDIA}@media (min-width: 1024px) { .a { padding: 13px; } }`;
  assert.equal(await fixed(other, useScale()), `${MEDIA}@media (min-width: 1024px) { .a { padding: 12px; } }`);
});

test('@supports and @container scope a token like @media', async () => {
  for (const wrapper of ['@supports (display: grid)', '@container card (min-width: 20rem)']) {
    const code = `${wrapper} { :root { --space-3: 12px; } }\n.a { padding: 13px; }`;
    assert.equal(await fixed(code, useScale()), `${wrapper} { :root { --space-3: 12px; } }\n.a { padding: 12px; }`, wrapper);
  }
});

test('a token under @layer is defined everywhere and still written', async () => {
  const code = '@layer tokens { :root { --space-3: 12px; } }\n.a { padding: 13px; }';
  assert.equal(await fixed(code, useScale()), '@layer tokens { :root { --space-3: 12px; } }\n.a { padding: var(--space-3); }');
});

test('a token file read through scaleSources keeps its scopes: media-only and component tokens are not written', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'tokens.css');
  fs.writeFileSync(file, ':root { --space-1: 4px; --space-2: 8px; }\n@media (min-width: 768px) { :root { --space-3: 12px; } }\n.card { --space-card: 16px; }\n');
  const code = '.a { padding: 13px; margin: 17px; gap: 9px; }';
  assert.equal(await fixed(code, useScale({ scaleSources: [file] })), '.a { padding: 12px; margin: 16px; gap: var(--space-2); }');
  assert.equal(await fixed('.a { padding: 12px; margin: 16px; }', preferToken({ scaleSources: [file] })), '.a { padding: 12px; margin: 16px; }');
});

test('a component token and a root token holding one value: the root one is written outside the block, neither inside', async () => {
  const code = ':root { --space-3: 12px; }\n.card { --space-card: 12px; padding: 13px; }\n.other { padding: 13px; }';
  assert.equal(
    await fixed(code, useScale()),
    ':root { --space-3: 12px; }\n.card { --space-card: 12px; padding: 12px; }\n.other { padding: var(--space-3); }',
  );
});

// No token in a fallback.

test('no rule writes a token into a var() fallback (fix-02)', async () => {
  const root = ':root { --space-3: 12px; }\n';
  assert.equal(await fixed(`${root}.a { margin: var(--space-4, 13px); }`, useScale()), `${root}.a { margin: var(--space-4, 12px); }`);
  assert.equal(await fixed(`${root}.a { margin: var(--brand, 13px); }`, useScale()), `${root}.a { margin: var(--brand, 12px); }`);
  assert.equal(await fixed(`${root}.a { transform: translateX(var(--shift, 13px)); }`, transform()), `${root}.a { transform: translateX(var(--shift, 12px)); }`);
  for (const options of [{}, MAP]) {
    const code = `${root}.a { margin: var(--space-4, 12px); }`;
    assert.equal(await fixed(code, preferToken(options)), code, JSON.stringify(options));
  }
});
