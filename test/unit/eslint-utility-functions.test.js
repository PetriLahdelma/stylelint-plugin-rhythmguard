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

/**
 * One finding per `[token, nearest, other]`: located on the token itself,
 * with the two nearest steps as suggestions (nearest first) and no autofix
 * (cs-06, cs-09). With `fixOffScale: "nearest"` the same findings carry the
 * 3.20 autofix to the nearest step, given as `fixed`.
 */
function cases(code, findings, fixed) {
  const errors = findings.map(([token, ...steps]) => {
    const column = code.indexOf(token) + 1;
    return {
      column,
      endColumn: column + token.length,
      messageId: 'offScaleUtilities',
      suggestions: steps.map((step) => ({
        messageId: 'useStep',
        output: code.replace(token, step),
      })),
    };
  });
  return [
    { code, errors, output: null },
    { code, errors, options: [{ fixOffScale: 'nearest' }], output: fixed },
  ];
}

function run(invalid) {
  tester.run('tailwind-class-use-scale', rule, { valid: [], invalid });
}

test('eslint rule detects arbitrary spacing in cn() calls', () => {
  run(cases('const cls = cn("p-[13px] flex");', [['p-[13px]', 'p-3', 'p-3.5']], 'const cls = cn("p-3 flex");'));
});

test('eslint rule detects arbitrary spacing in clsx() calls', () => {
  run(cases(
    'const cls = clsx("p-[13px]", "m-[7px]");',
    [['p-[13px]', 'p-3', 'p-3.5'], ['m-[7px]', 'm-1.5', 'm-2']],
    'const cls = clsx("p-3", "m-1.5");',
  ));
});

test('eslint rule detects arbitrary spacing in twMerge() calls', () => {
  run(cases(
    'const cls = twMerge("p-[13px]", active && "m-[7px]");',
    [['p-[13px]', 'p-3', 'p-3.5'], ['m-[7px]', 'm-1.5', 'm-2']],
    'const cls = twMerge("p-3", active && "m-1.5");',
  ));
});

test('eslint rule detects arbitrary spacing in cva() variant objects', () => {
  run(cases(
    'const button = cva("base", { variants: { size: { sm: "p-[5px]" } } });',
    [['p-[5px]', 'p-1', 'p-1.5']],
    'const button = cva("base", { variants: { size: { sm: "p-1" } } });',
  ));
});

test('eslint rule detects arbitrary spacing in JSX className with cn()', () => {
  run(cases('<div className={cn("p-[13px]")} />', [['p-[13px]', 'p-3', 'p-3.5']], '<div className={cn("p-3")} />'));
});

test('eslint rule detects arbitrary spacing after Tailwind variants and important modifiers', () => {
  run(cases(
    'const cls = "md:p-[13px] hover:!gap-[18px] lg:p-[13px]!";',
    [
      ['md:p-[13px]', 'md:p-3', 'md:p-3.5'],
      ['hover:!gap-[18px]', 'hover:!gap-4', 'hover:!gap-5'],
      ['lg:p-[13px]!', 'lg:p-3!', 'lg:p-3.5!'],
    ],
    'const cls = "md:p-3 hover:!gap-4 lg:p-3!";',
  ));
});

test('eslint rule ignores arbitrary variants while checking their spacing utilities', () => {
  tester.run('tailwind-class-use-scale', rule, {
    valid: [
      'const cls = "data-[state=open]:pb-8 aria-[sort=ascending]:text-sm";',
      'const snippet = "className=\\"md:p-[13px]\\"";',
    ],
    invalid: cases(
      'const cls = "has-[>button]:ml-[-0.3rem] data-[state=open]:pb-8 [&:nth-child(3)]:mt-[13px]";',
      [
        ['has-[>button]:ml-[-0.3rem]', 'has-[>button]:-ml-1', 'has-[>button]:-ml-1.5'],
        ['[&:nth-child(3)]:mt-[13px]', '[&:nth-child(3)]:mt-3', '[&:nth-child(3)]:mt-3.5'],
      ],
      'const cls = "has-[>button]:-ml-1 data-[state=open]:pb-8 [&:nth-child(3)]:mt-3";',
    ),
  });
});
