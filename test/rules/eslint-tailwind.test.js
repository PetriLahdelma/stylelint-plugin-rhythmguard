'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');

test('eslint tailwind class rule reports off-scale arbitrary values', () => {
  const linter = new Linter();

  const messages = linter.verify(
    "const classes = 'p-[13px] gap-[8px]';",
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': ['error', {
          scale: [0, 4, 8, 12, 16, 24, 32],
        }],
      },
    },
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /p-\[13px\]/);
});

test('eslint tailwind class rule autofixes nearest value', () => {
  const linter = new Linter();

  const fixResult = linter.verifyAndFix(
    "const classes = 'p-[13px]';",
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': ['error', {
          scale: [0, 4, 8, 12, 16, 24, 32],
        }],
      },
    },
  );

  assert.equal(fixResult.fixed, true);
  assert.equal(fixResult.output, "const classes = 'p-3';");
});

test('eslint tailwind motion rule reports arbitrary duration and easing values', () => {
  const linter = new Linter();

  const messages = linter.verify(
    "const classes = 'duration-[175ms] ease-[cubic-bezier(.2,0,0,1)] delay-[75ms]';",
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error',
      },
    },
  );

  assert.equal(messages.length, 2);
  assert.match(messages[0].message, /duration-\[175ms\]/);
  assert.match(messages[1].message, /ease-\[cubic-bezier/);
});

test('eslint tailwind motion rule autofixes nearest duration value', () => {
  const linter = new Linter();

  const fixResult = linter.verifyAndFix(
    "const classes = 'duration-[175ms] delay-[0.175s]';",
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error',
      },
    },
  );

  assert.equal(fixResult.fixed, true);
  assert.equal(fixResult.output, "const classes = 'duration-[150ms] delay-[0.15s]';");
});

function lintTailwindMotion(code) {
  const linter = new Linter();
  const config = {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { 'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error' },
  };
  return {
    fixed: linter.verifyAndFix(code, config),
    messages: linter.verify(code, config).map((message) => message.message),
  };
}

test('eslint tailwind motion rule accepts negative delays and checks their size (#236)', () => {
  assert.deepEqual(lintTailwindMotion("const c = 'delay-[-100ms] hover:delay-[-0.5s]';").messages, []);

  const { fixed, messages } = lintTailwindMotion("const c = 'delay-[-130ms]';");
  assert.deepEqual(messages, [
    'Unexpected Tailwind arbitrary motion duration "delay-[-130ms]". Use duration scale values (nearest: 100ms or 150ms).',
  ]);
  assert.equal(fixed.output, "const c = 'delay-[-150ms]';");
});

test('eslint tailwind motion rule still rejects negative durations (#236)', () => {
  const { fixed, messages } = lintTailwindMotion("const c = 'duration-[-100ms]';");
  assert.deepEqual(messages, [
    'Unexpected Tailwind arbitrary motion duration "duration-[-100ms]". Use non-negative duration values.',
  ]);
  assert.equal(fixed.fixed, false);
});

test('eslint tailwind motion rule reports raw easing curves only, not easing tokens (#245)', () => {
  assert.deepEqual(
    lintTailwindMotion("const c = 'ease-[var(--ease-out)] ease-[--my-ease] ease-(--my-ease) ease-[theme(--ease-in)]';").messages,
    [],
  );
  assert.deepEqual(
    lintTailwindMotion("const c = 'ease-[cubic-bezier(.2,0,0,1)] ease-[linear(0,0.5,1)] ease-[steps(4,_end)] md:ease-[Cubic-Bezier(0,0,1,1)]';").messages,
    [
      'Unexpected Tailwind arbitrary motion easing "ease-[cubic-bezier(.2,0,0,1)]". Use motion tokens for easing decisions.',
      'Unexpected Tailwind arbitrary motion easing "ease-[linear(0,0.5,1)]". Use motion tokens for easing decisions.',
      'Unexpected Tailwind arbitrary motion easing "ease-[steps(4,_end)]". Use motion tokens for easing decisions.',
      'Unexpected Tailwind arbitrary motion easing "md:ease-[Cubic-Bezier(0,0,1,1)]". Use motion tokens for easing decisions.',
    ],
  );
});

function lintTailwind(code, options) {
  const linter = new Linter();
  const config = {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error', options] },
  };
  return {
    fixed: linter.verifyAndFix(code, config),
    messages: linter.verify(code, config),
  };
}

test('tailwind rule names the utility classes for the two nearest steps', () => {
  const { messages } = lintTailwind("const c = 'p-[13px]';", { scale: [0, 4, 8, 12, 16, 24, 32] });
  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].message,
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
  );
});

test('tailwind rule fix writes the utility class when the snapped value is a step of the spacing unit', () => {
  const { fixed } = lintTailwind("const c = 'p-[13px] md:-m-[13px]! m-[-13px] !gap-[18px] p-[0.8125rem]';", {
    scale: [0, 4, 8, 12, 16, 24, 32],
  });
  assert.equal(fixed.output, "const c = 'p-3 md:-m-3! -m-3 !gap-4 p-3';");
});

test('tailwind rule fix writes a fractional utility for quarter steps', () => {
  const { fixed, messages } = lintTailwind("const c = 'p-[7px]';", { scale: [0, 2, 6, 10] });
  assert.equal(fixed.output, "const c = 'p-1.5';");
  assert.match(messages[0].message, /Use "p-1\.5" \(6px\) or "p-2\.5" \(10px\)\./);
});

test('tailwind rule keeps the arbitrary value when the snapped value is not a quarter step of the unit', () => {
  const { fixed, messages } = lintTailwind("const c = 'p-[5px]';", { scale: [0, 4, 8], spacingUnit: 3 });
  assert.equal(fixed.output, "const c = 'p-[4px]';");
  assert.equal(
    messages[0].message,
    'Unexpected Tailwind arbitrary spacing value "p-[5px]". Use scale values (nearest: 4px or 8px).',
  );
});

test('tailwind rule spacingUnit false keeps the arbitrary-value fix and message', () => {
  const { fixed, messages } = lintTailwind("const c = 'p-[13px]';", { scale: [0, 4, 8, 12, 16], spacingUnit: false });
  assert.equal(fixed.output, "const c = 'p-[12px]';");
  assert.match(messages[0].message, /nearest: 12px or 16px/);
});

test('tailwind rule spacingUnit follows a non-default unit', () => {
  const { fixed } = lintTailwind("const c = 'p-[13px]';", { scale: [0, 8, 16], spacingUnit: 8 });
  assert.equal(fixed.output, "const c = 'p-2';");
});

test('a class above the largest step names one class, not the same class twice', () => {
  const linter = new Linter();
  const messages = linter.verify(
    "const classes = 'p-[40px] m-[13px]';",
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: { 'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }] },
    },
  );

  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[40px]". Use "p-8" (32px).',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).',
  ]);
});
