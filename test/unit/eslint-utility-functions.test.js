'use strict';

const test = require('node:test');
const { RuleTester } = require('eslint');
const rule = require('../../src/eslint/rules/tailwind-class-use-scale');

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
        output: 'const cls = cn("p-3 flex");',
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
        output: 'const cls = clsx("p-3", "m-2");',
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
        output: 'const cls = twMerge("p-3", active && "m-2");',
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
        output: 'const button = cva("base", { variants: { size: { sm: "p-1" } } });',
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
        output: '<div className={cn("p-3")} />',
        errors: [{ message: /Unexpected Tailwind arbitrary spacing/ }],
      },
    ],
  });
});

test('eslint rule detects arbitrary spacing after Tailwind variants and important modifiers', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [],
    invalid: [
      {
        code: 'const cls = "md:p-[13px] hover:!gap-[18px] lg:p-[13px]!";',
        output: 'const cls = "md:p-3 hover:!gap-4 lg:p-3!";',
        errors: [
          { message: /Unexpected Tailwind arbitrary spacing/ },
          { message: /Unexpected Tailwind arbitrary spacing/ },
          { message: /Unexpected Tailwind arbitrary spacing/ },
        ],
      },
    ],
  });
});

test('eslint rule ignores arbitrary variants while checking their spacing utilities', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [
      'const cls = "data-[state=open]:pb-8 aria-[sort=ascending]:text-sm";',
      'const snippet = "className=\\"md:p-[13px]\\"";',
    ],
    invalid: [
      {
        code: 'const cls = "has-[>button]:ml-[-0.3rem] data-[state=open]:pb-8 [&:nth-child(3)]:mt-[13px]";',
        output: 'const cls = "has-[>button]:-ml-1 data-[state=open]:pb-8 [&:nth-child(3)]:mt-3";',
        errors: [
          { message: /Unexpected Tailwind arbitrary spacing/ },
          { message: /Unexpected Tailwind arbitrary spacing/ },
        ],
      },
    ],
  });
});
