'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');
const { lintCss } = require('../helpers/lint');
const eslintPlugin = require('../../src/eslint');

const NOTE = 'See docs/spacing.md for approved exceptions.';

test('use-scale appends the note to every finding', async () => {
  const result = await lintCss({
    code: '.a { padding: 13px; margin: 17px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8, 12, 16, 24], note: NOTE }] },
  });
  assert.deepEqual(result.warnings.map((w) => w.text), [
    `Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). ${NOTE} (rhythmguard/use-scale)`,
    `Unexpected off-scale value "17px". Use scale values (nearest: 16px or 24px). ${NOTE} (rhythmguard/use-scale)`,
  ]);
});

test('use-scale puts the auto-scale fallback note before the configured note', async () => {
  const result = await lintCss({
    code: '.a { padding: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', note: NOTE }] },
  });
  assert.match(
    result.warnings[0].text,
    /No spacing tokens were found for scale "auto"; using preset "rhythmic-4"\. See docs\/spacing\.md for approved exceptions\. \(rhythmguard\/use-scale\)$/,
  );
});

test('prefer-token appends the note', async () => {
  const result = await lintCss({
    code: '.a { gap: 12px; }',
    rules: { 'rhythmguard/prefer-token': [true, { tokenMap: { '12px': 'var(--space-3)' }, note: NOTE }] },
  });
  assert.equal(result.warnings[0].text, `Unexpected raw scale value "12px". Use var(--space-3). ${NOTE} (rhythmguard/prefer-token)`);
});

test('no-offscale-transform appends the note', async () => {
  const result = await lintCss({
    code: '.a { transform: translateX(13px); }',
    rules: { 'rhythmguard/no-offscale-transform': [true, { scale: [0, 4, 8, 12, 16], note: NOTE }] },
  });
  assert.equal(
    result.warnings[0].text,
    `Unexpected transform translation value "13px". Use scale values (nearest: 12px or 16px). ${NOTE} (rhythmguard/no-offscale-transform)`,
  );
});

test('use-motion-scale appends the note to duration and easing findings', async () => {
  const result = await lintCss({
    code: '.a { transition-duration: 130ms; transition-timing-function: cubic-bezier(0.1, 0.2, 0.3, 0.4); }',
    rules: { 'rhythmguard/use-motion-scale': [true, { durationScale: [100, 200], note: NOTE }] },
  });
  assert.equal(result.warnings.length, 2);
  for (const warning of result.warnings) {
    assert.match(warning.text, /approved exceptions\. \(rhythmguard\/use-motion-scale\)$/);
  }
});

test('note must be a non-empty string of at most 200 characters', async () => {
  for (const note of ['', '   ', 'x'.repeat(201), 42]) {
    const result = await lintCss({
      code: '.a { padding: 13px; }',
      rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8], note }] },
    });
    assert.equal(result.invalidOptionWarnings.length, 1, `note ${JSON.stringify(note)} should be rejected`);
  }
  const ok = await lintCss({
    code: '.a { padding: 13px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: [0, 4, 8], note: 'x'.repeat(200) }] },
  });
  assert.deepEqual(ok.invalidOptionWarnings, []);
});

function lintTailwind(ruleName, code, options) {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(`rhythmguard-tailwind/${ruleName}`, eslintPlugin.rules[ruleName]);
  return linter.verify(code, {
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { [`rhythmguard-tailwind/${ruleName}`]: ['error', options] },
  });
}

test('the ESLint rules append the note', () => {
  const spacing = lintTailwind('tailwind-class-use-scale', "const c = 'p-[13px]';", { scale: [0, 4, 8, 12, 16], note: NOTE });
  assert.equal(spacing[0].message, `Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px). ${NOTE}`);
  const motion = lintTailwind('tailwind-class-use-motion-scale', "const c = 'duration-[130ms]';", { durationScale: [100, 200], note: NOTE });
  assert.equal(motion[0].message, `Unexpected Tailwind arbitrary motion duration "duration-[130ms]". Use duration scale values (nearest: 100ms or 200ms). ${NOTE}`);
});
