'use strict';

/**
 * The README pairs use-scale with Stylelint 18's value-type-custom-property-required-list
 * and says what each reports. This runs the README's config block as written, on
 * Stylelint 18 or newer (the core rule does not exist before), so the block and
 * the sentence above it stay true. On older Stylelint it skips.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');
const pluginPath = path.join(repoRoot, 'src', 'index.js');
const stylelintMajor = Number(require('stylelint/package.json').version.split('.')[0]);

function readmeConfig() {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const section = readme.slice(readme.indexOf("### Stylelint 18's custom-property rule"));
  const block = section.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, 'README has a json block under the Stylelint 18 heading');
  const config = JSON.parse(block[1]);
  assert.deepEqual(config.plugins, ['stylelint-plugin-rhythmguard']);
  return { ...config, plugins: [pluginPath] };
}

test('the README pairing config runs on Stylelint 18 and each rule reports what the README says', { skip: stylelintMajor < 18 && `Stylelint ${stylelintMajor}` }, async () => {
  const { default: stylelint } = await import('stylelint');
  const code = '.a { padding: 16px; margin: 13px; border-width: 1px; }\n';
  const result = await stylelint.lint({ code, config: readmeConfig(), fix: true });
  const { invalidOptionWarnings, warnings } = result.results[0];

  assert.deepEqual(invalidOptionWarnings, []);
  const byRule = (rule) => warnings.filter((warning) => warning.rule === rule).map((warning) => warning.text);
  const core = byRule('value-type-custom-property-required-list');
  assert.equal(core.length, 3, `the core rule reports every raw length, on the scale or not: ${core.join(' | ')}`);
  assert.match(core.join(' '), /"16px"/);
  assert.match(core.join(' '), /"1px"/);
  assert.ok(core.every((text) => !/nearest/.test(text)), 'the core rule names no step');
  assert.equal(result.code, '.a { padding: 16px; margin: 12px; border-width: 1px; }\n', 'use-scale fixes 13px; the core rule fixes nothing');
});

// The core-only recipe in docs/COMPARISON.md: run as written, each bullet under
// it checked. It uses no Rhythmguard rule, which is why it is a documented
// recipe and not a shipped config.
function comparisonRecipe() {
  const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'COMPARISON.md'), 'utf8');
  const section = doc.slice(doc.indexOf('### The `stylelint-18` recipe: core rules only'));
  const block = section.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, 'COMPARISON.md has a json block under the recipe heading');
  const config = JSON.parse(block[1]);
  assert.equal(config.plugins, undefined, 'the recipe uses core rules only');
  return config;
}

test('the COMPARISON.md stylelint-18 recipe reports what the page says', { skip: stylelintMajor < 18 && `Stylelint ${stylelintMajor}` }, async () => {
  const { default: stylelint } = await import('stylelint');
  const code = [
    '.a { padding: 13px; }',
    '.b { padding: 8px 16px; margin: -8px; }',
    '.c { margin: var(--space-3); }',
    '.d { padding: 0.75rem; }',
    '.e { gap: 1px; }',
    '',
  ].join('\n');
  const result = await stylelint.lint({ code, config: comparisonRecipe(), fix: true });
  const { invalidOptionWarnings, warnings } = result.results[0];
  assert.deepEqual(invalidOptionWarnings, []);
  const allowed = warnings.filter((warning) => warning.rule === 'declaration-property-value-allowed-list');
  assert.deepEqual(allowed.map((warning) => warning.line), [1, 4, 5], allowed.map((warning) => warning.text).join(' | '));
  assert.match(allowed[0].text, /^Disallowed value "13px" for property "padding"/);
  assert.ok(allowed.every((warning) => !/nearest|12px or 16px/.test(warning.text)), 'no step named');
  assert.equal(result.code, code, 'the recipe fixes nothing');
});
