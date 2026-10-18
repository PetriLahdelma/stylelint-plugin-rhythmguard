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

test('allowNegative false reports the negative class form as negative, without a fix (#241)', () => {
  const { fixed, messages } = lintTailwind("const c = '-m-[13px] -m-[16px] md:-mt-[0.5rem] m-[-16px] m-[13px]';", {
    allowNegative: false,
    scale: [0, 4, 8, 12, 16, 24, 32],
  });
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "-m-[13px]". Negative values are disabled for this rule.',
    'Unexpected Tailwind arbitrary spacing value "-m-[16px]". Negative values are disabled for this rule.',
    'Unexpected Tailwind arbitrary spacing value "md:-mt-[0.5rem]". Negative values are disabled for this rule.',
    'Unexpected Tailwind arbitrary spacing value "m-[-16px]". Negative values are disabled for this rule.',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-4" (16px).',
  ]);
  assert.equal(fixed.output, "const c = '-m-[13px] -m-[16px] md:-mt-[0.5rem] m-[-16px] m-3';");
});

test('the utility class follows baseFontSize when spacingUnit is not set (#247)', () => {
  // At a 10px root a Tailwind step is 0.25rem = 2.5px, so p-3 is 7.5px, not 12px.
  const offStep = lintTailwind("const c = 'p-[1.3rem] m-[13px]';", { baseFontSize: 10, scale: [0, 4, 8, 12, 16, 24, 32] });
  assert.deepEqual(offStep.messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[1.3rem]". Use scale values (nearest: 12px or 16px).',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use scale values (nearest: 12px or 16px).',
  ]);
  assert.equal(offStep.fixed.output, "const c = 'p-[1.2rem] m-[12px]';");

  const onStep = lintTailwind("const c = 'p-[1.3rem]';", { baseFontSize: 10, scale: [0, 5, 10, 15, 20] });
  assert.equal(onStep.messages[0].message, 'Unexpected Tailwind arbitrary spacing value "p-[1.3rem]". Use "p-4" (10px) or "p-6" (15px).');
  assert.equal(onStep.fixed.output, "const c = 'p-6';");

  const explicit = lintTailwind("const c = 'p-[1.3rem]';", { baseFontSize: 10, scale: [0, 4, 8, 12, 16], spacingUnit: 4 });
  assert.equal(explicit.fixed.output, "const c = 'p-3';", 'an explicit spacingUnit is used as given');
});

test('em values keep the arbitrary form: they follow the element font size, utilities follow the root (#247)', () => {
  const { fixed, messages } = lintTailwind("const c = 'p-[1.1em] -m-[0.8em]';", { scale: [0, 4, 8, 12, 16, 24, 32] });
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[1.1em]". Use scale values (nearest: 16px or 24px).',
    'Unexpected Tailwind arbitrary spacing value "-m-[0.8em]". Use scale values (nearest: 12px or 16px).',
  ]);
  assert.equal(fixed.output, "const c = 'p-[1em] -m-[0.75em]';");
});

test('a double negative is a positive value and is fixed to the positive class (#277)', () => {
  // Tailwind resolves -m-[-13px] to margin: 13px; the two signs cancel.
  const scale = [0, 4, 8, 12, 16, 24, 32];
  const { fixed, messages } = lintTailwind("const c = '-m-[-13px] md:-mt-[-0.8rem]';", { scale });
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "-m-[-13px]". Use "m-3" (12px) or "m-4" (16px).',
    'Unexpected Tailwind arbitrary spacing value "md:-mt-[-0.8rem]". Use "mt-3" (12px) or "mt-4" (16px).',
  ]);
  assert.equal(fixed.output, "const c = 'm-3 md:mt-3';");

  const arbitrary = lintTailwind("const c = '-m-[-13px]';", { scale, spacingUnit: false });
  assert.equal(arbitrary.fixed.output, "const c = '-m-[-12px]';", 'the arbitrary form keeps both signs');

  const noNegatives = lintTailwind("const c = '-m-[-16px] -m-[-13px]';", { allowNegative: false, scale });
  assert.deepEqual(noNegatives.messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "-m-[-13px]". Use "m-3" (12px) or "m-4" (16px).',
  ], 'a double negative is not a negative value');
});

test('both rules declare meta.type so --fix-type applies their fixes (#278)', async () => {
  const { ESLint } = require('eslint');
  for (const [name, rule] of Object.entries(eslintPlugin.rules)) {
    assert.equal(rule.meta.type, 'suggestion', name);
  }

  const eslint = new ESLint({
    fix: true,
    fixTypes: ['suggestion'],
    overrideConfig: {
      plugins: { 'rhythmguard-tailwind': eslintPlugin },
      rules: {
        'rhythmguard-tailwind/tailwind-class-use-scale': ['error', { scale: [0, 4, 8, 12, 16, 24, 32] }],
        'rhythmguard-tailwind/tailwind-class-use-motion-scale': 'error',
      },
    },
    overrideConfigFile: true,
  });
  const [result] = await eslint.lintText("const c = 'p-[13px] duration-[175ms]';");
  assert.equal(result.output, "const c = 'p-3 duration-[150ms]';");
});

test('configs.recommended works as a flat config on its own and keeps its rules spreadable (#279)', () => {
  const linter = new Linter();
  const code = "const c = 'p-[13px]';";
  const languageOptions = { ecmaVersion: 2022, sourceType: 'module' };

  const alone = linter.verify(code, [{ languageOptions }, eslintPlugin.configs.recommended]);
  assert.deepEqual(alone.map(({ ruleId, severity }) => [ruleId, severity]), [
    ['rhythmguard-tailwind/tailwind-class-use-scale', 1],
  ]);

  const spread = linter.verify(code, [{
    languageOptions,
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: eslintPlugin.configs.recommended.rules,
  }]);
  assert.deepEqual(spread.map(({ ruleId }) => ruleId), ['rhythmguard-tailwind/tailwind-class-use-scale']);

  const withFiles = linter.verify(code, [{ ...eslintPlugin.configs.recommended, files: ['**/*.js'], languageOptions }], 'a.js');
  assert.equal(withFiles.length, 1);

  assert.equal(eslintPlugin.configs.recommended.plugins['rhythmguard-tailwind'], eslintPlugin);
});
