'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

const ruleConfig = {
  'rhythmguard/use-scale': [
    true,
    {
      scale: [0, 4, 8, 12, 16, 24, 32],
      baseFontSize: 16,
    },
  ],
};

test('use-scale accepts on-scale spacing values', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; padding: 1rem; gap: 8px; }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale rejects off-scale spacing values', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-scale');
  assert.match(result.warnings[0].text, /13px/);
});

test('use-scale allows token functions', async () => {
  const result = await lintCss({
    code: '.card { margin: var(--space-3); padding: theme(spacing.4); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale allows var tokens with complex fallback content', async () => {
  const result = await lintCss({
    code: '.card { margin: var(--space-3, clamp(8px, min(12px, 3vw), 16px)); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale checks translate values in transform', async () => {
  const result = await lintCss({
    code: '.card { transform: translateX(13px) scale(1.05); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /off-scale/);
});

test('use-scale allows token functions inside transform translate values', async () => {
  const result = await lintCss({
    code: '.card { transform: translateY(theme(spacing.4)); }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale can lint nested calc values in transform when enabled', async () => {
  const result = await lintCss({
    code: '.card { transform: translateY(calc(10px + 3px)); }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          scale: [0, 4, 8, 12, 16, 24, 32],
          enforceInsideMathFunctions: true,
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => warning.rule === 'rhythmguard/use-scale'));
});

test('use-scale autofixes simple off-scale values', async () => {
  const result = await lintCss({
    code: '.card { margin: 13px; }',
    fix: true,
    rules: ruleConfig,
  });

  assert.equal(result.code, '.card { margin: 12px; }');
});

test('use-scale ignores unitless non-zero values', async () => {
  const result = await lintCss({
    code: '.card { margin: 13; }',
    rules: ruleConfig,
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale supports built-in presets', async () => {
  const result = await lintCss({
    code: '.card { margin: 16px; padding: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          preset: 'rhythmic-8',
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /12px/);
});

test('use-scale supports product and editorial presets', async () => {
  const productPreset = await lintCss({
    code: '.layout { padding: 56px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          preset: 'product-material-8dp',
        },
      ],
    },
  });

  const editorialPreset = await lintCss({
    code: '.article { margin-bottom: 30px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          preset: 'editorial-baseline-6',
        },
      ],
    },
  });

  assert.equal(productPreset.warnings.length, 0);
  assert.equal(editorialPreset.warnings.length, 0);
});

test('use-scale supports preset aliases', async () => {
  const result = await lintCss({
    code: '.card { margin: 16px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          preset: '8pt',
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale customScale overrides preset', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          customScale: [0, 12, 24],
          preset: 'rhythmic-8',
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 0);
});

test('use-scale reports unknown presets', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          preset: 'unknown-grid',
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /Unknown scale preset/);
});

test('use-scale does not report invalid preset when custom scale is provided', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          customScale: [0, 12, 24],
          preset: 'does-not-matter',
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 0);
});
