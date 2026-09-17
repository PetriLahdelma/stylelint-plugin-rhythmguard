'use strict';

/**
 * The browser playground entry: the real rules, run on a PostCSS root with a
 * Stylelint shim. `lint(css, options)` returns the warnings Stylelint would
 * report and, with `fix: true`, the fixed stylesheet.
 */
const postcss = require('postcss');
const postcssScss = require('postcss-scss');
const useScale = require('../../src/rules/use-scale');
const preferToken = require('../../src/rules/prefer-token');
const noOffscaleTransform = require('../../src/rules/no-offscale-transform');
const useMotionScale = require('../../src/rules/use-motion-scale');
const recommended = require('../../src/configs/recommended');
const strict = require('../../src/configs/strict');
const tailwind = require('../../src/configs/tailwind');
const { getScalePreset, listScalePresetNames } = require('../../src/presets/scales');
const sample = require('./sample.css');

const PLUGINS = [useScale, preferToken, noOffscaleTransform, useMotionScale];
const CONFIGS = { recommended, strict, tailwind };

function createResult({ fix, severity }) {
  const result = {
    invalidOptionWarnings: [],
    stylelint: { fix: Boolean(fix), fixed: 0, severity, stylelintError: false },
    warn(text, options = {}) {
      if (options.stylelintType === 'invalidOption') result.invalidOptionWarnings.push({ text });
      else result.warnings.push({ column: 1, line: 1, rule: 'rhythmguard', severity, text });
    },
    warnings: [],
  };
  return result;
}

/**
 * @param {string} css
 * @param {{ rules?: object, config?: 'recommended'|'strict'|'tailwind', fix?: boolean, syntax?: 'css'|'scss' }} options
 */
function lint(css, options = {}) {
  const rules = options.rules || (CONFIGS[options.config || 'recommended'] || recommended).rules;
  const syntax = options.syntax === 'scss' ? postcssScss : postcss;
  const root = syntax.parse(css, { from: options.syntax === 'scss' ? 'playground.scss' : 'playground.css' });
  const warnings = [];
  const invalidOptionWarnings = [];
  let fixed = 0;
  for (const plugin of PLUGINS) {
    const config = rules[plugin.ruleName];
    if (config === undefined || config === null || config === false) continue;
    const [primary, secondary] = Array.isArray(config) ? config : [config, undefined];
    if (primary === null || primary === false) continue;
    const severity = secondary && secondary.severity ? secondary.severity : 'error';
    const result = createResult({ fix: options.fix, severity });
    plugin.rule(primary, secondary)(root, result);
    warnings.push(...result.warnings);
    invalidOptionWarnings.push(...result.invalidOptionWarnings);
    fixed += result.stylelint.fixed;
  }
  warnings.sort((a, b) => a.line - b.line || a.column - b.column);
  return { fixed, invalidOptionWarnings, output: options.fix ? root.toString() : null, warnings };
}

/** Every declaration with its position, so a page can count and list what was checked. */
function declarations(css, syntax = 'css') {
  const root = (syntax === 'scss' ? postcssScss : postcss).parse(css);
  const list = [];
  root.walkDecls((decl) => {
    list.push({ column: decl.source.start.column, line: decl.source.start.line, prop: decl.prop, value: decl.value });
  });
  return list;
}

module.exports = {
  configs: Object.fromEntries(Object.entries(CONFIGS).map(([name, config]) => [name, config.rules])),
  declarations,
  getScalePreset,
  lint,
  presets: listScalePresetNames(),
  sample,
};
