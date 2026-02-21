'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

test('prefer-token can build token map from CSS custom properties', async () => {
  const result = await lintCss({
    code: ':root { --space-3: 12px; } .stack { gap: 12px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromCssCustomProperties: true,
        },
      ],
    },
  });

  assert.equal(result.code, ':root { --space-3: 12px; } .stack { gap: var(--space-3); }');
});

test('prefer-token can load token mappings from JSON file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-token-map-'));
  const tokenMapPath = path.join(tempDir, 'tokens.json');
  fs.writeFileSync(tokenMapPath, JSON.stringify({
    '--space-4': '16px',
  }));

  const result = await lintCss({
    code: '.stack { gap: 16px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFile: tokenMapPath,
        },
      ],
    },
  });

  assert.equal(result.code, '.stack { gap: var(--space-4); }');
});

test('prefer-token can load spacing values from Tailwind config', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-tailwind-map-'));
  const tailwindConfigPath = path.join(tempDir, 'tailwind.config.cjs');
  fs.writeFileSync(
    tailwindConfigPath,
    'module.exports = { theme: { spacing: { "3": "0.75rem", "4": "1rem" } } };',
  );

  const result = await lintCss({
    code: '.stack { gap: 0.75rem; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromTailwindSpacing: true,
          tailwindConfigPath,
        },
      ],
    },
  });

  assert.equal(result.code, '.stack { gap: theme(spacing.3); }');
});

test('prefer-token can load spacing values from ESM Tailwind config', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-tailwind-map-esm-'));
  const tailwindConfigPath = path.join(tempDir, 'tailwind.config.mjs');
  fs.writeFileSync(
    tailwindConfigPath,
    'export default { theme: { spacing: { "3": "0.75rem" }, extend: { spacing: { "5": "1.25rem" } } } };',
  );

  const result = await lintCss({
    code: '.stack { gap: 1.25rem; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromTailwindSpacing: true,
          tailwindConfigPath,
        },
      ],
    },
  });

  assert.equal(result.code, '.stack { gap: theme(spacing.5); }');
});
