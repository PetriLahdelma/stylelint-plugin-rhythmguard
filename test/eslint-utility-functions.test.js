'use strict';

const test = require('node:test');
const { RuleTester } = require('eslint');
const rule = require('../src/eslint/rules/tailwind-class-use-scale');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

test('eslint rule detects arbitrary spacing in cn() calls', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: 'const cls = cn("p-[13px] flex");',
        output: 'const cls = cn("p-[12px] flex");',
        errors: [{ message: /Unexpected Tailwind arbitrary spacing/ }],
      },
    ],
  });
});

test('eslint rule detects arbitrary spacing in clsx() calls', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: 'const cls = clsx("p-[13px]", "m-[7px]");',
        output: 'const cls = clsx("p-[12px]", "m-[8px]");',
        errors: [
          { message: /Unexpected Tailwind arbitrary spacing/ },
          { message: /Unexpected Tailwind arbitrary spacing/ },
        ],
      },
    ],
  });
});

test('eslint rule detects arbitrary spacing in twMerge() calls', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: 'const cls = twMerge("p-[13px]", active && "m-[7px]");',
        output: 'const cls = twMerge("p-[12px]", active && "m-[8px]");',
        errors: [
          { message: /Unexpected Tailwind arbitrary spacing/ },
          { message: /Unexpected Tailwind arbitrary spacing/ },
        ],
      },
    ],
  });
});

test('eslint rule detects arbitrary spacing in cva() variant objects', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: 'const button = cva("base", { variants: { size: { sm: "p-[5px]" } } });',
        output: 'const button = cva("base", { variants: { size: { sm: "p-[4px]" } } });',
        errors: [{ message: /Unexpected Tailwind arbitrary spacing/ }],
      },
    ],
  });
});

test('eslint rule detects arbitrary spacing in JSX className with cn()', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: '<div className={cn("p-[13px]")} />',
        output: '<div className={cn("p-[12px]")} />',
        errors: [{ message: /Unexpected Tailwind arbitrary spacing/ }],
      },
    ],
  });
});
