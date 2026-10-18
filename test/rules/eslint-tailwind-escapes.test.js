'use strict';

/**
 * Autofix must splice the fixed class into the raw source text of a string
 * literal, so escape sequences and JSX entities outside the class token stay
 * byte for byte, and the fixed file still parses (#225).
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');

const SCALE = [0, 4, 8, 12, 16, 24, 32];

function configFor(rule, options) {
  return {
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { ecmaFeatures: { jsx: true } },
      sourceType: 'module',
    },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [`rhythmguard-tailwind/${rule}`]: ['error', options] },
  };
}

function lint(code, rule = 'tailwind-class-use-scale', options = { scale: SCALE }) {
  const linter = new Linter();
  const config = configFor(rule, options);
  const messages = linter.verify(code, config);
  const fixed = linter.verifyAndFix(code, config);
  const afterFix = linter.verify(fixed.output, config);
  return { afterFix, fixed, messages };
}

function assertParses(messages) {
  const fatal = messages.filter((message) => message.fatal);
  assert.deepEqual(fatal, [], 'fixed output must parse');
}

test('fix keeps a \\n escape after the class (#225)', () => {
  const { afterFix, fixed, messages } = lint("const a = 'p-[13px]\\n';");
  assert.equal(messages.length, 1);
  assert.equal(fixed.output, "const a = 'p-3\\n';");
  assertParses(afterFix);
});

test('fix keeps an escaped backslash inside an arbitrary content value (#225)', () => {
  const { afterFix, fixed } = lint('const b = "p-[13px] before:content-[\'\\\\201C\']";');
  assert.equal(fixed.output, 'const b = "p-3 before:content-[\'\\\\201C\']";');
  assertParses(afterFix);
});

test('fix keeps a lone escaped backslash between classes (#225)', () => {
  const { afterFix, fixed } = lint("const c = 'p-[13px] \\\\ x';");
  assert.equal(fixed.output, "const c = 'p-3 \\\\ x';");
  assertParses(afterFix);
});

test('fix keeps a JSX attribute entity as written (#225)', () => {
  const { afterFix, fixed, messages } = lint('const el = <div className="p-[13px] &quot;x" />;');
  assert.equal(messages.length, 1);
  assert.equal(fixed.output, 'const el = <div className="p-3 &quot;x" />;');
  assertParses(afterFix);
});

test('fix keeps numeric and unknown JSX entities before the class', () => {
  const { afterFix, fixed } = lint("const el = <div className='&#65; &nosuch; &amp; p-[13px]' />;");
  assert.equal(fixed.output, "const el = <div className='&#65; &nosuch; &amp; p-3' />;");
  assertParses(afterFix);
});

test('fix keeps escaped quotes, unicode escapes and line continuations around classes', () => {
  const { afterFix, fixed } = lint(
    "const d = 'it\\'s \\u00e9 \\u{1F600} p-[13px] \\\nm-[13px]\\tgap-[18px]';",
  );
  assert.equal(
    fixed.output,
    "const d = 'it\\'s \\u00e9 \\u{1F600} p-3 \\\nm-3\\tgap-4';",
  );
  assertParses(afterFix);
});

test('fix keeps an escaped delimiter quote in a double-quoted string', () => {
  const { afterFix, fixed } = lint('const e = "a\\"b p-[13px]";');
  assert.equal(fixed.output, 'const e = "a\\"b p-3";');
  assertParses(afterFix);
});

test('a class written with an escape inside it is reported but not fixed', () => {
  const code = "const f = 'p-[13\\x70x] m-[13px]';";
  const { fixed, messages } = lint(code);
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).',
  ]);
  assert.equal(fixed.output, "const f = 'p-[13\\x70x] m-3';");
});

test('template literal classes next to an escape are reported and left unfixed', () => {
  const code = 'const g = `p-[13px]\\n m-[13px]\\tgap-[18px] ${x}`;';
  const { afterFix, fixed, messages } = lint(code);
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).',
    'Unexpected Tailwind arbitrary spacing value "gap-[18px]". Use "gap-4" (16px) or "gap-6" (24px).',
  ]);
  assert.equal(fixed.output, code);
  assertParses(afterFix);
});

test('motion fix keeps escapes and entities outside the class (#225)', () => {
  const rule = 'tailwind-class-use-motion-scale';
  const js = lint("const a = 'duration-[175ms]\\n \\\\ x';", rule, {});
  assert.equal(js.fixed.output, "const a = 'duration-[150ms]\\n \\\\ x';");
  assertParses(js.afterFix);

  const jsx = lint('const el = <div className="duration-[175ms] &quot;x" />;', rule, {});
  assert.equal(jsx.fixed.output, 'const el = <div className="duration-[150ms] &quot;x" />;');
  assertParses(jsx.afterFix);

  const escaped = lint("const b = 'duration-[17\\x35ms]';", rule, {});
  assert.equal(escaped.messages.length, 1);
  assert.equal(escaped.fixed.output, "const b = 'duration-[17\\x35ms]';");

  const template = lint('const c = `duration-[175ms]\\n`;', rule, {});
  assert.equal(template.messages.length, 1);
  assert.equal(template.fixed.output, 'const c = `duration-[175ms]\\n`;');
});
