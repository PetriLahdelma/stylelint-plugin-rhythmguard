'use strict';

/**
 * Editor and agent ergonomics of `tailwind-class-use-scale` in 3.21 (cs-09,
 * fix-10, cs-06): every finding has a messageId and points at its own class
 * token; an off-scale value carries its two nearest steps as suggestions and
 * no autofix; autofix only rewrites a class to one that renders the same
 * value, unless `fixOffScale: "nearest"` asks for the 3.20 behaviour.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');
const { CLASS_MESSAGES } = require('../../src/core/tailwind-class-analysis');
const { fakeSvelteParser, fakeVueParser } = require('../helpers/fake-template-parsers');

const RULE = 'rhythmguard-tailwind/tailwind-class-use-scale';
const SCALE = [0, 4, 8, 12, 16, 24, 32];

function config(options, extra = {}) {
  return {
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: { ecmaFeatures: { jsx: true } },
      sourceType: 'module',
    },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', options] },
    ...extra,
  };
}

function lint(code, options = { scale: SCALE }, extra = {}, filename = undefined) {
  const linter = new Linter();
  const cfg = extra.files ? [config(options, extra)] : config(options, extra);
  const messages = linter.verify(code, cfg, filename ? { filename } : undefined);
  assert.deepEqual(messages.filter(({ fatal }) => fatal), [], 'the code parses');
  return {
    fixed: linter.verifyAndFix(code, cfg, filename ? { filename } : undefined),
    messages,
  };
}

/** The source text a message's loc covers (single-line locations). */
function covered(code, message) {
  const line = code.split('\n')[message.line - 1];
  assert.equal(message.endLine, message.line);
  return line.slice(message.column - 1, message.endColumn - 1);
}

function applySuggestion(code, suggestion) {
  const [start, end] = suggestion.fix.range;
  return code.slice(0, start) + suggestion.fix.text + code.slice(end);
}

test('five findings in one className point at five tokens, each with two suggestions and no fix (cs-09, cs-06)', () => {
  const code = 'export const A = () => <div className="p-[13px] m-[13px] gap-[13px] px-[14px] py-[15px]" />;';
  const { fixed, messages } = lint(code);

  assert.deepEqual(messages.map((message) => covered(code, message)), ['p-[13px]', 'm-[13px]', 'gap-[13px]', 'px-[14px]', 'py-[15px]']);
  assert.deepEqual(messages.map(({ messageId }) => messageId), Array(5).fill('offScaleUtilities'));
  for (const message of messages) {
    assert.equal(message.fix, undefined, `${message.message} has no autofix`);
    assert.equal(message.suggestions.length, 2, message.message);
  }
  assert.equal(fixed.fixed, false, '--fix changes nothing');

  // The nearest step first, then the other one; each rewrites its token only.
  assert.deepEqual(messages[0].suggestions.map(({ desc }) => desc), ['Use "p-3" (12px).', 'Use "p-4" (16px).']);
  assert.deepEqual(messages[4].suggestions.map(({ desc }) => desc), ['Use "py-4" (16px).', 'Use "py-3" (12px).']);
  assert.equal(
    applySuggestion(code, messages[4].suggestions[0]),
    'export const A = () => <div className="p-[13px] m-[13px] gap-[13px] px-[14px] py-4" />;',
  );
});

test('the message text is the 3.20 text; messageIds and data rebuild it', () => {
  const { messages } = lint("cn('p-[13px] p-[40px] p-[5px] -p-[13px]');", { scale: SCALE, spacingUnit: 3 });
  assert.deepEqual(messages.map(({ message, messageId }) => [messageId, message]), [
    ['offScale', 'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use scale values (nearest: 12px or 16px).'],
    ['offScale', 'Unexpected Tailwind arbitrary spacing value "p-[40px]". Use scale values (nearest: 32px).'],
    ['offScale', 'Unexpected Tailwind arbitrary spacing value "p-[5px]". Use scale values (nearest: 4px or 8px).'],
    ['noNegativeForm', 'Unexpected Tailwind arbitrary spacing value "-p-[13px]". Padding and gap cannot be negative, so this class has no effect.'],
  ]);

  const negative = lint("cn('-m-[13px] p-[40px]');", { allowNegative: false, note: 'See the spacing guide.', scale: SCALE });
  assert.deepEqual(negative.messages.map(({ message, messageId }) => [messageId, message]), [
    ['negative', 'Unexpected Tailwind arbitrary spacing value "-m-[13px]". Negative values are disabled for this rule. See the spacing guide.'],
    ['offScaleUtility', 'Unexpected Tailwind arbitrary spacing value "p-[40px]". Use "p-8" (32px). See the spacing guide.'],
  ]);

  const rule = eslintPlugin.rules['tailwind-class-use-scale'];
  assert.equal(rule.meta.hasSuggestions, true);
  for (const [id, template] of Object.entries(CLASS_MESSAGES)) {
    assert.equal(rule.meta.messages[id], template, id);
    assert.match(template, /^Unexpected Tailwind arbitrary spacing value "\{\{token\}\}"\. .*\{\{suffix\}\}$/, id);
  }
});

test('a value past the top step gets one suggestion and no fix; a negative or no-negative-form finding gets none', () => {
  const { messages } = lint("cn('p-[64px] -p-[13px] -m-[13px]');", { allowNegative: true, scale: SCALE });
  assert.deepEqual(messages.map(({ suggestions = [] }) => suggestions.map(({ desc }) => desc)), [
    ['Use "p-8" (32px).'],
    [],
    ['Use "-m-3" (12px).', 'Use "-m-4" (16px).'],
  ]);
  assert.ok(messages.every(({ fix }) => fix === undefined));

  const disabled = lint("cn('-m-[13px]');", { allowNegative: false, scale: SCALE });
  assert.equal(disabled.messages[0].suggestions, undefined);
});

test('suggestions keep the arbitrary form when the step is not a utility, and keep em values in em', () => {
  const { messages } = lint("cn('p-[5px] m-[1.1em]');", { scale: [0, 4, 8, 16, 24], spacingUnit: 3 });
  assert.deepEqual(messages.map(({ suggestions }) => suggestions.map(({ fix }) => fix.text)), [
    ['p-[4px]', 'p-[8px]'],
    ['m-[1em]', 'm-[1.5em]'],
  ]);
});

test('fixOffScale "nearest" autofixes as 3.20 did, with the same findings and suggestions', () => {
  const code = "cn('p-[13px] md:gap-[18px] p-[64px]');";
  const off = lint(code);
  const nearest = lint(code, { fixOffScale: 'nearest', scale: SCALE });
  assert.deepEqual(nearest.messages.map(({ message }) => message), off.messages.map(({ message }) => message));
  assert.deepEqual(
    nearest.messages.map(({ suggestions }) => suggestions.length),
    off.messages.map(({ suggestions }) => suggestions.length),
  );
  assert.equal(off.fixed.output, code);
  assert.equal(nearest.fixed.output, "cn('p-3 md:gap-4 p-[64px]');", 'no fix past the top step');

  assert.throws(() => lint(code, { fixOffScale: 'lower', scale: SCALE }), /Value "lower" should be equal to one of the allowed values/);
});

test('reportEquivalents reports exact equivalents with an autofix; off by default, so findings do not grow', () => {
  const code = "cn('p-[12px] p-[0.75rem] -m-[12px] m-[-8px] -m-[-4px] p-[1em] -p-[12px] p-3 p-[13px]');";
  assert.deepEqual(lint(code).messages.map(({ messageId }) => messageId), ['offScaleUtilities'], 'only p-[13px] by default');

  const { fixed, messages } = lint(code, { reportEquivalents: true, scale: SCALE });
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[12px]". "p-3" is the same value (12px).',
    'Unexpected Tailwind arbitrary spacing value "p-[0.75rem]". "p-3" is the same value (12px).',
    'Unexpected Tailwind arbitrary spacing value "-m-[12px]". "-m-3" is the same value (12px).',
    'Unexpected Tailwind arbitrary spacing value "m-[-8px]". "-m-2" is the same value (8px).',
    'Unexpected Tailwind arbitrary spacing value "-m-[-4px]". "m-1" is the same value (4px).',
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
  ]);
  assert.deepEqual(messages.map(({ messageId }) => messageId).slice(0, 5), Array(5).fill('equivalent'));
  // em follows the element's font size, so it has no utility; -p-* does not exist.
  assert.equal(fixed.output, "cn('p-3 p-3 -m-3 -m-2 m-1 p-[1em] -p-[12px] p-3 p-[13px]');");
});

test('a template literal chunk is located per token and fixed when it has no escape (fix-10)', () => {
  const code = 'const c = cn(`p-[13px] ${x} m-[7px]`);';
  const { messages } = lint(code);
  assert.deepEqual(messages.map((message) => covered(code, message)), ['p-[13px]', 'm-[7px]']);
  assert.equal(applySuggestion(code, messages[1].suggestions[0]), 'const c = cn(`p-[13px] ${x} m-2`);');

  const nearest = lint(code, { fixOffScale: 'nearest', scale: SCALE });
  assert.equal(nearest.fixed.output, 'const c = cn(`p-3 ${x} m-2`);');

  // A multi-line chunk: the location is on the token's own line.
  const multiline = 'const d = cn(`flex\n  p-[13px]`);';
  const [message] = lint(multiline).messages;
  assert.equal(message.line, 2);
  assert.equal(covered(multiline, message), 'p-[13px]');
});

test('a template chunk with an escape is located per token but not fixed or suggested', () => {
  const code = 'const g = cn(`p-[13px]\\n m-[13px]`);';
  const { fixed, messages } = lint(code, { fixOffScale: 'nearest', scale: SCALE });
  assert.deepEqual(messages.map((message) => covered(code, message)), ['p-[13px]', 'm-[13px]']);
  assert.ok(messages.every(({ suggestions }) => suggestions === undefined));
  assert.equal(fixed.output, code);
});

test('a string with escapes is located on the raw token; a token written with an escape gets no suggestion', () => {
  const code = "const f = cn('it\\'s p-[13\\x70x] \\u00e9 m-[13px]');";
  const { messages } = lint(code);
  assert.deepEqual(messages.map((message) => covered(code, message)), ['p-[13\\x70x]', 'm-[13px]']);
  assert.equal(messages[0].suggestions, undefined);
  assert.equal(applySuggestion(code, messages[1].suggestions[0]), "const f = cn('it\\'s p-[13\\x70x] \\u00e9 m-3');");

  const entity = 'const el = <div className="a&amp;b p-[13px]" />;';
  const [jsx] = lint(entity).messages;
  assert.equal(covered(entity, jsx), 'p-[13px]');
});

test('Vue and Svelte template class text is located per token, with suggestions', () => {
  const vue = '<template><div class="flex p-[13px] m-[7px]"></div></template>';
  const vueResult = lint(vue, { scale: SCALE }, { files: ['**/*.vue'], languageOptions: { parser: fakeVueParser } }, 'App.vue');
  assert.deepEqual(vueResult.messages.map((message) => covered(vue, message)), ['p-[13px]', 'm-[7px]']);
  assert.equal(applySuggestion(vue, vueResult.messages[1].suggestions[0]), '<template><div class="flex p-[13px] m-2"></div></template>');
  assert.equal(vueResult.fixed.fixed, false);

  const svelte = `<div class="p-[13px] {on ? 'gap-[18px]' : ''} m-[7px]"></div>`;
  const svelteResult = lint(svelte, { scale: SCALE }, { files: ['**/*.svelte'], languageOptions: { parser: fakeSvelteParser } }, 'App.svelte');
  assert.deepEqual(svelteResult.messages.map((message) => covered(svelte, message)), ['p-[13px]', 'gap-[18px]', 'm-[7px]']);
  assert.ok(svelteResult.messages.every(({ suggestions }) => suggestions.length === 2));
});
