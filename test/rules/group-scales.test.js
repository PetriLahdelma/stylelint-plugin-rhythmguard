'use strict';

/**
 * `scales` (issue #204): a scale per property group, so a type ladder can sit
 * next to the spacing scale in one use-scale block. Lookup order is
 * propertyScales, then scales[group], then scale.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const SPACING = [0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64];
const TYPE = [14, 16, 18, 20, 24, 32, 40];
const rule = (extra = {}) => ({
  'rhythmguard/use-scale': [true, { propertyGroups: ['spacing', 'typography', 'radius'], scale: SPACING, ...extra }],
});
const texts = (result) => result.warnings.map((warning) => warning.text);

test('typography is checked against its own ladder and the message names it; spacing keeps the spacing scale', async () => {
  const result = await lintCss({
    code: '.a { padding: 18px; font-size: 18px; font-size: 17px; }',
    rules: rule({ scales: { typography: TYPE } }),
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(texts(result), [
    'Unexpected off-scale value "18px". Use scale values (nearest: 16px or 24px). (rhythmguard/use-scale)',
    'Unexpected off-scale value "17px". Use typography scale values (nearest: 16px or 18px). (rhythmguard/use-scale)',
  ]);
});

test('unitless line-height stays exempt under a type scale', async () => {
  const result = await lintCss({ code: '.a { line-height: 1.4; line-height: 1; }', rules: rule({ scales: { typography: TYPE } }) });
  assert.deepEqual(texts(result), []);
});

test('a group scale may be a preset name', async () => {
  const result = await lintCss({ code: '.a { border-radius: 6px; }', rules: rule({ scales: { radius: 'rhythmic-4' } }) });
  assert.match(texts(result)[0], /Use radius scale values \(nearest: 4px or 8px\)/);
});

test('"auto" reads the group\'s own tokens, and a group without enough tokens falls back to scale', async () => {
  const code = ':root { --font-size-s: 14px; --font-size-m: 16px; --font-size-l: 18px; --font-size-xl: 20px; }\n.a { font-size: 17px; border-radius: 6px; }';
  const result = await lintCss({ code, rules: rule({ scales: { radius: 'auto', typography: 'auto' } }) });

  assert.deepEqual(texts(result), [
    'Unexpected off-scale value "17px". Use typography scale values (nearest: 16px or 18px). (rhythmguard/use-scale)',
    'Unexpected off-scale value "6px". Use scale values (nearest: 4px or 8px). (rhythmguard/use-scale)',
  ]);
});

test('propertyScales still wins over the group scale for its property', async () => {
  const result = await lintCss({
    code: '.a { font-size: 17px; letter-spacing: 3px; }',
    rules: rule({ propertyScales: { 'font-size': [17] }, scales: { typography: TYPE } }),
  });
  assert.deepEqual(texts(result), ['Unexpected off-scale value "3px". Use typography scale values (nearest: 14px). (rhythmguard/use-scale)']);
});

test('--fix snaps to the group scale', async () => {
  const result = await lintCss({ code: '.a { font-size: 19px; padding: 19px; }', fix: true, rules: rule({ scales: { typography: TYPE } }) });
  assert.equal(result.code, '.a { font-size: 18px; padding: 16px; }');
});

test('scales rejects unknown groups and unknown presets', async () => {
  for (const scales of [{ motion: [100] }, { typography: 'no-such-preset' }, { typography: [-1] }]) {
    const result = await lintCss({ code: '.a { padding: 13px; }', rules: rule({ scales }) });
    assert.equal(result.invalidOptionWarnings.length, 1, JSON.stringify(scales));
  }
});

test('scales rejects an empty list and an unknown preset object, in the rules and in audit.scales (#273)', async () => {
  const { isGroupScalesMap } = require('../../src/core/options');
  for (const scales of [{ spacing: [] }, { spacing: { preset: 'nope' } }, { spacing: { scale: [] } }]) {
    assert.equal(isGroupScalesMap(scales), false, JSON.stringify(scales));
    const result = await lintCss({ code: '.a { padding: 13px; }', rules: rule({ scales }) });
    assert.equal(result.invalidOptionWarnings.length, 1, JSON.stringify(scales));
  }
  assert.equal(isGroupScalesMap({ spacing: { preset: '8pt' }, typography: 'auto' }), true);
});

test('outline-offset follows the spacing scale in scales, not the radius one, though the radius group checks it', async () => {
  const result = await lintCss({
    code: '.a { outline-offset: 3px; border-radius: 3px; }',
    rules: rule({ scales: { radius: [0, 3, 6], spacing: [0, 2, 4, 8] } }),
  });
  assert.deepEqual(texts(result), ['Unexpected off-scale value "3px". Use spacing scale values (nearest: 2px or 4px). (rhythmguard/use-scale)']);
});
