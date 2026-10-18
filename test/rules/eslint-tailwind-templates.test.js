'use strict';

/**
 * Vue and Svelte template `class` attributes (#244). vue-eslint-parser and
 * svelte-eslint-parser are not installed here, so these run against
 * test/helpers/fake-template-parsers.js, which builds the node shapes the
 * real parsers document.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');
const { fakeSvelteParser, fakeVueParser } = require('../helpers/fake-template-parsers');

const SCALE = [0, 4, 8, 12, 16, 24, 32];

function lint(code, parser, filename) {
  const linter = new Linter();
  const config = [{
    files: ['**/*.vue', '**/*.svelte'],
    languageOptions: { parser },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: SCALE }] },
  }];
  return {
    fixed: linter.verifyAndFix(code, config, { filename }),
    messages: linter.verify(code, config, { filename }),
  };
}

test('a Vue template class attribute is checked and fixed, as well as script strings', () => {
  const code = [
    '<template><div class="p-[13px]"></div></template>',
    '<script>export default { data(){ return { c: "m-[13px]" } } }</script>',
  ].join('\n');
  const { fixed, messages } = lint(code, fakeVueParser, 'App.vue');

  assert.deepEqual(messages.map(({ line, message }) => [line, message]), [
    [1, 'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).'],
    [2, 'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).'],
  ]);
  assert.equal(fixed.output, [
    '<template><div class="p-3"></div></template>',
    '<script>export default { data(){ return { c: "m-3" } } }</script>',
  ].join('\n'));
});

test('Vue: bound class strings are checked, other attributes are not, entities are kept', () => {
  const code = [
    '<template>',
    `  <div title="p-[13px]" :class="{ 'gap-[18px]': on }"></div>`,
    '  <span class="a&amp;b m-[7px]"></span>',
    '</template>',
  ].join('\n');
  const { fixed, messages } = lint(code, fakeVueParser, 'App.vue');

  assert.deepEqual(messages.map(({ line, message }) => [line, message]), [
    [2, 'Unexpected Tailwind arbitrary spacing value "gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px).'],
    [3, 'Unexpected Tailwind arbitrary spacing value "m-[7px]". Use "m-1" (4px) or "m-2" (8px).'],
  ]);
  assert.equal(fixed.output, [
    '<template>',
    `  <div title="p-[13px]" :class="{ 'gap-4': on }"></div>`,
    '  <span class="a&amp;b m-2"></span>',
    '</template>',
  ].join('\n'));
});

test('a Svelte class attribute is checked and fixed, as well as script strings', () => {
  const code = [
    '<script>let x = "m-[13px]";</script>',
    '<div class="p-[13px]"></div>',
  ].join('\n');
  const { fixed, messages } = lint(code, fakeSvelteParser, 'App.svelte');

  assert.deepEqual(messages.map(({ line, message }) => [line, message]), [
    [1, 'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).'],
    [2, 'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).'],
  ]);
  assert.equal(fixed.output, [
    '<script>let x = "m-3";</script>',
    '<div class="p-3"></div>',
  ].join('\n'));
});

test('Svelte: text around a mustache tag is checked, other attributes are not', () => {
  const code = `<div class="p-[13px] {active ? 'gap-[18px]' : ''} m-[7px]" title="p-[13px]"></div>`;
  const { fixed, messages } = lint(code, fakeSvelteParser, 'App.svelte');

  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
    'Unexpected Tailwind arbitrary spacing value "gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px).',
    'Unexpected Tailwind arbitrary spacing value "m-[7px]". Use "m-1" (4px) or "m-2" (8px).',
  ]);
  assert.equal(fixed.output, `<div class="p-3 {active ? 'gap-4' : ''} m-2" title="p-[13px]"></div>`);
});
