'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('./helpers/lint');

test('use-motion-scale reports off-scale transition duration longhands', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].rule, 'rhythmguard/use-motion-scale');
  assert.match(result.warnings[0].text, /motion duration/);
});

test('use-motion-scale autofixes off-scale duration values', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; animation-delay: 0.175s; }',
    fix: true,
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.code, '.button { transition-duration: 150ms; animation-delay: 0.15s; }');
});

test('use-motion-scale reports shorthand duration drift', async () => {
  const result = await lintCss({
    code: '.button { transition: opacity 175ms cubic-bezier(.2, 0, 0, 1) 75ms; }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some((warning) => /175ms/.test(warning.text)));
  assert.ok(result.warnings.some((warning) => /cubic-bezier/.test(warning.text)));
});

test('use-motion-scale reports negative durations without autofix', async () => {
  const result = await lintCss({
    code: '.button { animation-duration: -75ms; }',
    fix: true,
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.code, '.button { animation-duration: -75ms; }');
});

test('use-motion-scale ignores invalid non-time values', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: fast; animation-delay: var(--duration-fast); }',
    rules: {
      'rhythmguard/use-motion-scale': true,
    },
  });

  assert.equal(result.warnings.length, 0);
});

test('use-motion-scale supports custom duration scale', async () => {
  const result = await lintCss({
    code: '.button { transition-duration: 175ms; }',
    rules: {
      'rhythmguard/use-motion-scale': [
        true,
        {
          durationScale: [0, 175, 350],
        },
      ],
    },
  });

  assert.equal(result.warnings.length, 0);
});
