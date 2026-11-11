'use strict';

/**
 * One default scale per surface, defined once (dx-06, cs-01, cs-05, css-01):
 * the rule default, configs/recommended, configs/strict, the audit and the
 * `rhythmic-4` preset are the same list; the ESLint rule and the audit's class
 * strings default to Tailwind's ladder; configs/tailwind reads the project's
 * scale and falls back to that ladder.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Linter } = require('eslint');

const { DEFAULT_SCALE, TAILWIND_DEFAULT_SCALE } = require('../../src/presets/default-scale');
const { getScalePreset } = require('../../src/presets/scales');
const { createDefaultAuditOptions } = require('../../src/audit/shared');
const { createAuditReport } = require('../../src/audit/report');
const eslintPlugin = require('../../src/eslint');
const recommended = require('../../src/configs/recommended');
const strict = require('../../src/configs/strict');
const tailwind = require('../../src/configs/tailwind');
const { lintCss } = require('../helpers/lint');

const root = path.join(__dirname, '..', '..');
const pluginPath = path.join(root, 'src', 'index.js');

test('every stylesheet surface reads the one DEFAULT_SCALE', () => {
  assert.deepEqual([...DEFAULT_SCALE], [0, 4, 8, 12, 16, 24, 32, 40, 48, 64]);
  assert.deepEqual(recommended.rules['rhythmguard/use-scale'][1].scale, [...DEFAULT_SCALE]);
  assert.deepEqual(strict.rules['rhythmguard/use-scale'][1].scale, [...DEFAULT_SCALE]);
  assert.equal(getScalePreset('rhythmic-4'), DEFAULT_SCALE);
  assert.equal(createDefaultAuditOptions().scale, DEFAULT_SCALE);
});

test('the use-scale default and the audit default agree on 40, 48 and 64px', async () => {
  const code = '.a { padding: 40px; margin: 48px; gap: 64px; inset: 13px; }';
  const lint = await lintCss({ code, rules: { 'rhythmguard/use-scale': true } });
  assert.deepEqual(lint.warnings.map((warning) => /"(\d+px)"/.exec(warning.text)[1]), ['13px']);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-one-scale-'));
  fs.writeFileSync(path.join(dir, 'a.css'), `${code}\n`);
  const report = await createAuditReport({ dir, noConfig: true });
  assert.equal(report.scale.source, 'default');
  assert.deepEqual(report.findings.css.filter((finding) => finding.type === 'off-scale').map((finding) => finding.value), ['13px']);
});

test('the Tailwind preset is the default ladder of the ESLint rule', () => {
  assert.equal(getScalePreset('tailwind'), TAILWIND_DEFAULT_SCALE);
  for (const step of [2, 6, 10, 14, 20, 28, 36, 44, 56, 80, 96, 384]) {
    assert.ok(TAILWIND_DEFAULT_SCALE.includes(step), `${step}px is a Tailwind step`);
  }
});

function eslintMessages(code, options) {
  const linter = new Linter();
  const config = {
    languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' },
    plugins: { rhythmguard: eslintPlugin },
    rules: { 'rhythmguard/tailwind-class-use-scale': options ? ['error', options] : 'error' },
  };
  return { fixed: linter.verifyAndFix(code, config).output, messages: linter.verify(code, config) };
}

test('the ESLint rule reports nothing on Tailwind\'s default steps and names its scale', () => {
  const steps = ['p-[2px]', 'p-[6px]', 'p-[10px]', 'p-[20px]', 'p-[28px]', 'p-[40px]', 'p-[48px]', 'p-[64px]', 'p-[1.25rem]', 'p-[384px]'];
  assert.deepEqual(eslintMessages(`const c = cn('${steps.join(' ')}');`).messages, []);

  const { messages, fixed } = eslintMessages("const c = cn('p-[13px]');");
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /Use "p-3" \(12px\) or "p-3\.5" \(14px\)\. Scale: Tailwind default spacing\.$/);
  assert.equal(fixed, "const c = cn('p-3');");
});

test('the ESLint rule names no scale when one is configured; messages keep their 3.19 text', () => {
  const { messages } = eslintMessages("const c = cn('p-[13px]');", { scale: [0, 4, 8, 12, 16, 24, 32] });
  assert.equal(messages[0].message, 'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).');
});

test('no fix past the top of the scale: 64px is not snapped to a 32px top step', () => {
  const { messages, fixed } = eslintMessages("const c = 'p-[64px] p-[400px]';", { scale: [0, 4, 8, 12, 16, 24, 32] });
  assert.equal(messages.length, 2, 'both values are still reported');
  assert.equal(fixed, "const c = 'p-[64px] p-[400px]';");
});

test('configs/tailwind reports nothing on Tailwind steps and falls back to the Tailwind ladder', async () => {
  const { default: stylelint } = await import('stylelint');
  const config = {
    ...tailwind,
    extends: [path.join(root, 'src', 'configs', 'strict.js')],
    plugins: [pluginPath],
  };
  const code = '.a { padding: 20px; margin: 28px; inset: 44px; padding-inline: 14px; padding-block: 1.25rem; gap: 16px; translate: 6px; }\n.b { margin: 13px; }';
  const result = await stylelint.lint({ code, config, configBasedir: root });
  const [entry] = result.results;
  assert.deepEqual(entry.invalidOptionWarnings, []);
  // prefer-token still asks for a token where none exists; that is gate semantics (3.20 item 2), not the scale.
  const values = entry.warnings.filter((warning) => warning.rule !== 'rhythmguard/prefer-token').map((warning) => warning.text);
  assert.ok(values.every((text) => /13px/.test(text) || /using preset "tailwind"/.test(text)), values.join('\n'));
  assert.ok(values.some((text) => /"13px"/.test(text)), 'the off-scale 13px is still reported');
  assert.ok(values.some((text) => /No spacing tokens were found for scale "auto"; using preset "tailwind"/.test(text)));
});

test('the audit judges class strings by the Tailwind ladder when the project has no scale', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-one-scale-classes-'));
  fs.writeFileSync(path.join(dir, 'App.jsx'), 'export const A = () => <div className="p-[20px] m-[13px]" />;\n');
  const report = await createAuditReport({ dir, noConfig: true });
  assert.equal(report.scale.classStrings.source, 'tailwind-default');
  assert.deepEqual(report.findings.tailwind.map((finding) => finding.token || finding.rawValue), ['m-[13px]']);
});
