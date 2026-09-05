'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `rhythmguard-${prefix}-`));
}

function useScaleAuto(extra = {}) {
  return { 'rhythmguard/use-scale': [true, { scale: 'auto', ...extra }] };
}

test('scale "auto" infers the scale from spacing custom properties in the linted stylesheet', async () => {
  const result = await lintCss({
    code: [
      '@theme { --spacing-1: 4px; --spacing-2: 8px; --spacing-3: 12px; --spacing-4: 16px; }',
      '.a { margin: 12px; padding: 13px; gap: 24px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.match(texts[1], /"24px"/, '24px is not a token in this stylesheet, so it is off the inferred scale');
});

test('scale "auto" prefers explicit scaleSources files over the stylesheet', async () => {
  const dir = tempDir('scale-sources');
  const tokensPath = path.join(dir, 'tokens.json');
  fs.writeFileSync(tokensPath, JSON.stringify({
    spacing: {
      1: { $value: '4px', $type: 'dimension' },
      2: { $value: '8px', $type: 'dimension' },
      3: { $value: '12px', $type: 'dimension' },
      4: { $value: '16px', $type: 'dimension' },
    },
  }));

  const result = await lintCss({
    code: ':root { --spacing-odd: 5px; } .a { margin: 5px; padding: 8px; }',
    rules: useScaleAuto({ scaleSources: [tokensPath] }),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"5px".*nearest: 4px or 8px/);
});

test('scale "auto" reads audit.tokenSources from .rhythmguardrc.json in the working directory', async () => {
  const dir = tempDir('rc-sources');
  fs.writeFileSync(path.join(dir, 'theme.css'), '@theme { --spacing-1: 0.25rem; --spacing-2: 0.5rem; --spacing-6: 1.5rem; }');
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    audit: { tokenSources: [{ path: './theme.css', format: 'css' }] },
  }));

  const previousCwd = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = await lintCss({
      code: '.a { margin: 24px; padding: 20px; }',
      rules: useScaleAuto(),
    });
  } finally {
    process.chdir(previousCwd);
  }

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"20px".*nearest: 8px or 24px/);
});

test('scale "auto" can read theme.spacing from a Tailwind v3 config', async () => {
  const dir = tempDir('tailwind-auto');
  const configPath = path.join(dir, 'tailwind.config.cjs');
  fs.writeFileSync(configPath, 'module.exports = { theme: { spacing: { "1": "0.25rem", "2": "0.5rem", "4": "1rem" } } };');

  const result = await lintCss({
    code: '.a { margin: 8px; padding: 12px; }',
    rules: useScaleAuto({ tailwindConfigPath: configPath }),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"12px".*nearest: 8px or 16px/);
});

test('scale "auto" falls back to rhythmic-4 and says so once per file when no tokens are found', async () => {
  const previousCwd = process.cwd();
  process.chdir(tempDir('no-tokens'));
  let result;
  try {
    result = await lintCss({
      code: '.a { margin: 13px; padding: 7px; gap: 12px; }',
      rules: useScaleAuto(),
    });
  } finally {
    process.chdir(previousCwd);
  }

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 2, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"13px".*nearest: 12px or 16px/);
  assert.match(result.warnings[0].text, /No spacing tokens were found for scale "auto"; using preset "rhythmic-4"/);
  assert.doesNotMatch(result.warnings[1].text, /No spacing tokens/);
});

test('scale "auto" works for no-offscale-transform', async () => {
  const result = await lintCss({
    code: [
      ':root { --space-1: 4px; --space-2: 8px; --space-4: 16px; }',
      '.a { transform: translateY(18px); }',
    ].join('\n'),
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: 'auto' }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /"18px".*nearest: 16px or 16px|"18px".*nearest: 16px/);
});

test('scale still rejects arbitrary strings and scaleSources must be an array', async () => {
  const bad = await lintCss({
    code: '.a { margin: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'nope' }] },
  });
  assert.ok(bad.invalidOptionWarnings.length >= 1, JSON.stringify(bad.invalidOptionWarnings));
  assert.match(bad.invalidOptionWarnings[0].text, /Invalid value "nope" for option "scale"/);

  const badSources = await lintCss({
    code: '.a { margin: 13px; }',
    rules: useScaleAuto({ scaleSources: './tokens.json' }),
  });
  assert.equal(badSources.invalidOptionWarnings.length, 1, JSON.stringify(badSources.invalidOptionWarnings));
});

test('scale "auto" reads token values wrapped in calc(<length> * var(--factor)) as Radix Themes writes them', async () => {
  const result = await lintCss({
    code: [
      ':root { --space-1: calc(4px * var(--scaling)); --space-2: calc(8px * var(--scaling)); --space-4: calc(var(--scaling) * 16px); }',
      '.a { margin: 8px; padding: 13px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"13px".*nearest: 8px or 16px/);
});

test('scale "auto" expands a bare Tailwind v4 --spacing base into the default multiplier scale', async () => {
  const result = await lintCss({
    code: [
      '@theme inline { --spacing: 0.25rem; --color-primary: #000; }',
      '.a { padding: 13px; margin: 20px; gap: 96px; inset: 100px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 14px/);
  assert.match(texts[1], /"100px"/);
});

test('scale "auto" matches prefixed spacing tokens but not letter-spacing or word-spacing', async () => {
  const result = await lintCss({
    code: [
      ':root { --lb-spacing-1: 4px; --lb-spacing-2: 8px; --mantine-spacing-md: 16px; --letter-spacing-2: 0.01em; --word-spacing-1: 0.75em; }',
      '.a { margin: 16px; padding: 13px; gap: 0.75em; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 8px or 16px/);
  assert.match(texts[1], /"0\.75em"/, 'word-spacing value must not have joined the scale');
});

test('scale "auto" falls back when fewer than three token values are found, because a one-token scale is worse than the default', async () => {
  const result = await lintCss({
    code: ':root { --lb-spacing: 1rem; } .a { margin: 8px; padding: 13px; }',
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 1, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.match(texts[0], /using preset "rhythmic-4"/);
});
