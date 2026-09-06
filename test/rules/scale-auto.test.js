'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

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

test('scale "auto" discovers spacing tokens shipped by installed design-token packages', async () => {
  const dir = tempDir('token-packages');
  fs.mkdirSync(path.join(dir, 'node_modules', 'tailwindcss'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","devDependencies":{"tailwindcss":"^4.1.0"}}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss","version":"4.1.0"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'theme.css'), '@theme default { --spacing: 0.25rem; --color-red-500: red; }\n');

  const previousCwd = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = await lintCss({
      code: '@import "tailwindcss";\n.a { padding: 13px; margin: 20px; }',
      rules: useScaleAuto(),
    });
  } finally {
    process.chdir(previousCwd);
  }

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.warnings.length, 1, result.warnings.map((w) => w.text).join('\n'));
  assert.match(result.warnings[0].text, /"13px".*nearest: 12px or 14px/);
  assert.doesNotMatch(result.warnings[0].text, /No spacing tokens/);
});

test('token packages with their own naming (Primer --base-size-*) are read through a per-package pattern', async () => {
  const dir = tempDir('token-packages-primer');
  const primer = path.join(dir, 'node_modules', '@primer', 'primitives');
  fs.mkdirSync(path.join(primer, 'dist', 'css', 'base', 'size'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","dependencies":{"@primer/primitives":"^10.0.0"}}');
  fs.writeFileSync(path.join(primer, 'package.json'), '{"name":"@primer/primitives","version":"10.0.0"}');
  fs.writeFileSync(
    path.join(primer, 'dist', 'css', 'base', 'size', 'size.css'),
    ':root { --base-size-4: 0.25rem; --base-size-8: 0.5rem; --base-size-12: 0.75rem; --base-size-16: 1rem; --base-size-24: 1.5rem; }\n',
  );

  const previousCwd = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = await lintCss({ code: '.a { padding: 13px; margin: 24px; gap: 32px; }', rules: useScaleAuto() });
  } finally {
    process.chdir(previousCwd);
  }

  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.match(texts[1], /"32px"/, '32px is on rhythmic-4 but not on Primer\'s ladder, so it proves the package scale was used');
  assert.doesNotMatch(texts[0], /No spacing tokens/);
});

test('token packages that are only transitive dependencies are ignored', async () => {
  const dir = tempDir('token-packages-transitive');
  fs.mkdirSync(path.join(dir, 'node_modules', 'tailwindcss'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","devDependencies":{"stylelint-config-tailwindcss":"^1.0.0"}}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'package.json'), '{"name":"tailwindcss","version":"4.1.0"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'tailwindcss', 'theme.css'), '@theme default { --spacing: 0.25rem; }\n');

  const previousCwd = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = await lintCss({ code: '.a { padding: 13px; }', rules: useScaleAuto() });
  } finally {
    process.chdir(previousCwd);
  }

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /using preset "rhythmic-4"/, 'a transitive tailwindcss must not supply the scale');
});

test('scale "auto" reads Sass variables and maps from the linted SCSS file itself (issue #52)', async () => {
  const result = await lintCss({
    customSyntax: require.resolve('postcss-scss'),
    code: [
      '$spacer: 1rem !default;',
      '$spacers: (',
      '  0: 0,',
      '  1: $spacer * .25,',
      '  2: $spacer * .5,',
      '  3: $spacer,',
      ') !default;',
      '$dropdown-spacer: .125rem;',
      '.a { padding: 13px; margin: 8px; gap: 2px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 8px or 16px/);
  assert.match(texts[1], /"2px"/, 'the component variable $dropdown-spacer must not have put 2px on the scale');
  assert.doesNotMatch(texts[0], /No spacing tokens/);
});

test('scale "auto" accepts tokens named spacer, as PatternFly names them (issue #85)', async () => {
  const result = await lintCss({
    code: [
      ':root { --pf-t--global--spacer--100: 0.25rem; --pf-t--global--spacer--200: 0.5rem; --pf-t--global--spacer--300: 0.75rem; --pf-t--global--spacer--400: 1rem; --pf-t--global--spacer--500: 1.5rem; }',
      '.a { margin: 16px; padding: 13px; gap: 20px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.doesNotMatch(texts[0], /using preset/);
});

test('scale "auto" reads the Carbon spacing scale from an installed @carbon/layout package (issue #87)', async () => {
  const dir = tempDir('token-packages-carbon');
  fs.mkdirSync(path.join(dir, 'node_modules', '@carbon', 'layout', 'scss', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","dependencies":{"@carbon/layout":"^11.0.0"}}');
  fs.writeFileSync(path.join(dir, 'node_modules', '@carbon', 'layout', 'package.json'), '{"name":"@carbon/layout","version":"11.58.0"}');
  fs.writeFileSync(
    path.join(dir, 'node_modules', '@carbon', 'layout', 'scss', 'generated', '_spacing.scss'),
    ['$spacing-01: 0.125rem !default;', '$spacing-02: 0.25rem !default;', '$spacing-03: 0.5rem !default;', '$spacing-04: 0.75rem !default;', '$spacing-05: 1rem !default;', '$spacing-06: 1.5rem !default;', '$spacing-07: 2rem !default;', '$spacing: (', '  spacing-01: $spacing-01,', '  spacing-02: $spacing-02,', ');', ''].join('\n'),
  );

  const previousCwd = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = await lintCss({
      code: '.a { padding: 13px; margin: 24px; gap: 20px; }',
      rules: useScaleAuto(),
    });
  } finally {
    process.chdir(previousCwd);
  }

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.match(texts[1], /"20px".*nearest: 16px or 24px/);
  assert.doesNotMatch(texts[0], /No spacing tokens/);
});

test('scale "auto" uses one Tailwind --spacing base when several theme blocks define different bases (issue #89)', async () => {
  const result = await lintCss({
    code: [
      '@theme { --spacing: 0.25rem; }',
      '@theme { --spacing: 0.2rem; }',
      '.a { padding: 13px; margin: 12.8px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 14px/, 'the 0.25rem ladder, not a union with the 0.2rem ladder');
  assert.match(texts[1], /"12\.8px"/, '12.8px belongs to the ignored second base and must be reported');
});

test('scale "auto" rejects stylesheet tokens that do not form a coherent scale and says why (issue #88)', async () => {
  const result = await lintCss({
    code: [
      ':root { --chip-spacing: 3px; --avatar-spacing: 2px; --badge-spacing: 5px; --modal-spacing: 25px; }',
      '.a { margin: 8px; padding: 13px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 1, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/, 'the preset is used, not the incoherent tokens');
  assert.match(texts[0], /do not form a spacing scale \(no common step\); using preset "rhythmic-4"/);
});

test('assessScale accepts ladders with a common step and rejects fractional or stepless sets', () => {
  const { assessScale } = require('../../src/core/scale-inference');
  const ok = (scale) => assessScale(scale).plausible;

  assert.equal(ok({ source: 'stylesheet', values: [0, 4, 8, 12, 16, 24, 32] }), true);
  assert.equal(ok({ source: 'stylesheet', values: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60] }), true, 'a five-based ladder is a scale too');
  assert.equal(ok({ source: 'stylesheet', values: [0, 2, 3, 5, 6, 25] }), false);
  assert.deepEqual(assessScale({ source: 'stylesheet', values: [0, 2, 3, 5, 6, 25] }).reasons, ['no common step']);
  assert.equal(ok({ source: 'stylesheet', values: [0, 0.4, 0.7, 1, 1.4, 2] }), false);
  assert.equal(ok({ source: 'stylesheet', values: [0, 4, 8] }), false, 'fewer than three steps');
  assert.equal(ok({ source: 'scanned-css', values: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 34, 36, 40, 48, 50, 52, 60, 64, 68, 80, 100, 120, 132, 280], files: ['a/variables.scss'] }), false, 'every integer is not a scale even when most are even');
  assert.equal(ok({ source: 'stylesheet', values: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384] }), true, 'a long four-based ladder such as an expanded Tailwind base is fine');
  assert.equal(ok({ source: 'scaleSources', values: [0, 2, 3, 5, 6, 25] }), true, 'explicit sources are trusted');
  assert.equal(ok({ source: 'fallback', values: [0, 4, 8, 12] }), false, 'fallback is never the project scale');
  assert.equal(ok({ source: 'scanned-css', values: [0, 1, 2, 10, 12, 16, 20, 22, 32], files: ['a/Avatar.module.css', 'a/Chip.module.css', 'a/default-css-variables.css'] }), false, 'mostly component files and an imperfect ladder');
  assert.equal(ok({ source: 'scanned-css', values: [0, 2, 4, 6, 8, 12, 16, 24, 32, 64], files: ['a/_primitives.scss', 'a/markdown.scss', 'a/markdown.scss'] }), true, 'a perfect ladder is trusted whatever the file names');
});

test('scale "auto" prefers root-level tokens over component-local variables when the root set is a scale (issue #54)', async () => {
  const result = await lintCss({
    code: [
      ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }',
      '.chip { --chip-spacing-xs: 10px; --chip-spacing-sm: 22px; }',
      '.a { margin: 10px; padding: 22px; gap: 12px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 2, texts.join('\n'));
  assert.match(texts[0], /"10px".*nearest: 8px or 12px/, 'the component variable did not join the scale');
  assert.match(texts[1], /"22px".*nearest: 16px or 16px|"22px".*nearest: 16px/);
});

test('scale "auto" uses component-level tokens when the root does not define a scale of its own', async () => {
  const result = await lintCss({
    code: [
      ':root { --space-1: 4px; }',
      '.stack { --stack-spacing-1: 8px; --stack-spacing-2: 12px; --stack-spacing-3: 16px; }',
      '.a { margin: 13px; padding: 12px; }',
    ].join('\n'),
    rules: useScaleAuto(),
  });

  const texts = result.warnings.map((w) => w.text);
  assert.equal(texts.length, 1, texts.join('\n'));
  assert.match(texts[0], /"13px".*nearest: 12px or 16px/);
  assert.doesNotMatch(texts[0], /using preset/);
});
