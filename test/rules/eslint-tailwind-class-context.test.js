'use strict';

/**
 * The ESLint rule checks class strings, not every string (cs-04, fix-09):
 * class contexts always, other strings only with two or more utility-shaped
 * tokens, type positions and non-class attributes never. The exit criterion
 * for 3.20: `eslint --fix` changes nothing outside class contexts on the
 * type, enum and `aria-label` probes.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');
const { countUtilityShapedTokens, isUtilityShaped } = require('../../src/eslint/class-context');
const { createTailwindClassAnalyzer } = require('../../src/core/tailwind-class-analysis');
const { fixtureTsParser, fixtureTsSource } = require('../helpers/fixture-ts-parser');

const SCALE = [0, 4, 8, 12, 16, 24, 32];
const RULE = 'rhythmguard-tailwind/tailwind-class-use-scale';

function lint(code, options = {}, languageOptions = {}) {
  const linter = new Linter();
  const config = [{
    files: ['**/*.jsx', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: { ecmaFeatures: { jsx: true } },
      sourceType: 'module',
      ...languageOptions,
    },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', { scale: SCALE, ...options }] },
  }];
  const filename = languageOptions.parser ? 'probe.tsx' : 'probe.jsx';
  const messages = linter.verify(code, config, { filename });
  assert.deepEqual(messages.filter(({ fatal }) => fatal), [], 'the probe parses');
  return {
    fixed: linter.verifyAndFix(code, config, { filename }),
    tokens: messages.map(({ message }) => /"([^"]+)"/.exec(message)[1]),
  };
}

test('exit criterion: --fix leaves type, enum and interface literals and aria-label alone (TypeScript)', () => {
  const { fixed, tokens } = lint(fixtureTsSource('probe.tsx'), {}, { parser: fixtureTsParser });
  // Only the cn() argument is a class string; the multi-token strings in the
  // enum, the interface, the template literal type and the parameter type are
  // types, and title / aria-label are not class attributes.
  assert.deepEqual(tokens, ['p-[13px]']);
  assert.equal(fixed.output, fixtureTsSource('probe.fixed.tsx'));
});

test('exit criterion: --fix leaves non-class JSX attributes, enum-like objects and prose alone', () => {
  const code = [
    "const Spacing = Object.freeze({ Tight: 'p-[13px]' });",
    "const message = 'Error in p-[13px] string';",
    'export const A = () => (',
    '  <div',
    '    aria-label="p-[13px] m-[7px]"',
    '    title="p-[13px] m-[7px]"',
    '    id="m-[13px]"',
    '    data-size="p-[13px] gap-[18px]"',
    '    alt="p-[13px] m-[7px]"',
    '    placeholder={`p-[13px] m-[7px]`}',
    '  >',
    "    <Box padding=\"p-[13px] m-[7px]\" label={'p-[13px] m-[7px]'} />",
    "    {'release p-[13px] notes'}",
    '  </div>',
    ');',
    '',
  ].join('\n');
  const { fixed, tokens } = lint(code);
  assert.deepEqual(tokens, []);
  assert.equal(fixed.output, code);
});

test('class contexts: className, class, *ClassName and className properties', () => {
  const code = [
    'export const A = () => <div className="p-[13px]" />;',
    'export const B = () => <div class="m-[13px]" />;',
    'export const C = () => <Dialog contentClassName="gap-[18px]" />;',
    "export const D = () => <div className={'p-[7px]'} />;",
    'export const E = () => <div className={`m-[7px] ${x}`} />;',
    "export const F = () => <NavLink className={({ isActive }) => (isActive ? 'p-[13px]' : '')} />;",
    "const props = { className: 'gap-[7px]' };",
    '',
  ].join('\n');
  const { fixed, tokens } = lint(code);
  assert.deepEqual(tokens, ['p-[13px]', 'm-[13px]', 'gap-[18px]', 'p-[7px]', 'm-[7px]', 'p-[13px]', 'gap-[7px]']);
  assert.equal(fixed.output, [
    'export const A = () => <div className="p-3" />;',
    'export const B = () => <div class="m-3" />;',
    'export const C = () => <Dialog contentClassName="gap-4" />;',
    "export const D = () => <div className={'p-2'} />;",
    // Template literal chunks are reported, not fixed (unchanged).
    'export const E = () => <div className={`m-[7px] ${x}`} />;',
    "export const F = () => <NavLink className={({ isActive }) => (isActive ? 'p-3' : '')} />;",
    "const props = { className: 'gap-2' };",
    '',
  ].join('\n'));
});

test('class functions: arguments, nested arrays, object keys, conditionals and cva/tv config', () => {
  const code = [
    "cn('p-[13px]', on && 'm-[13px]', [x ? 'gap-[18px]' : null, ['p-[7px]']], { 'm-[7px]': on });",
    "clsx(a ?? 'p-[13px]', 'm-[13px]' + extra);",
    "classnames({ 'gap-[7px]': on });",
    "cx('p-[13px]');",
    "twMerge('m-[13px]', twJoin('gap-[18px]'));",
    "utils.cn('p-[7px]');",
    "const button = cva('p-[13px]', { variants: { size: { sm: 'm-[7px]' } }, compoundVariants: [{ size: 'sm', class: 'gap-[18px]' }] });",
    "const card = tv({ base: 'p-[13px]', slots: { body: 'm-[13px]' } });",
    '',
  ].join('\n');
  const { tokens } = lint(code);
  assert.deepEqual(tokens, [
    'p-[13px]', 'm-[13px]', 'gap-[18px]', 'p-[7px]', 'm-[7px]',
    'p-[13px]', 'm-[13px]',
    'gap-[7px]',
    'p-[13px]',
    'm-[13px]', 'gap-[18px]',
    'p-[7px]',
    'p-[13px]', 'm-[7px]', 'gap-[18px]',
    'p-[13px]', 'm-[13px]',
  ]);
});

test('class functions: the condition of a ternary is not a class string', () => {
  const { tokens } = lint([
    "cn(size === 'p-[13px]' ? 'm-[13px]' : '');",
    "cn(kind === 'gap-[18px]' && 'p-[7px]');",
    '',
  ].join('\n'));
  assert.deepEqual(tokens, ['m-[13px]', 'p-[7px]']);
});

test('other calls take the context they sit in', () => {
  const { tokens } = lint([
    'export const A = () => <div className={mergeClasses(\'p-[13px]\')} />;',
    "cn(items.map((item) => item.on && 'm-[13px]'));",
    'export const B = () => <div title={t(\'p-[13px] m-[7px]\')} onClick={() => setPad(\'gap-[18px] m-[7px]\')} />;',
    "const one = pick('p-[13px]');",
    "const two = pick('flex gap-[18px]');",
    '',
  ].join('\n'));
  assert.deepEqual(tokens, ['p-[13px]', 'm-[13px]', 'gap-[18px]']);
});

test('the shared analyzer never names or writes -p-3 or -gap-3, so the audit agrees (cs-08)', () => {
  const analyzer = createTailwindClassAnalyzer({ scale: SCALE });
  for (const token of ['-p-[13px]', 'p-[-13px]', '-gap-[13px]', 'gap-y-[-13px]', '-pt-[-13px]']) {
    const analysis = analyzer.analyzeToken(token);
    assert.equal(analysis.reason, 'no-negative-form', token);
    assert.equal(analysis.fixedToken, null, token);
    assert.equal(analysis.nearestUtilities, null, token);
  }
  assert.equal(analyzer.analyzeToken('-m-[13px]').fixedToken, '-m-3');
  assert.equal(analyzer.analyzeToken('-translate-x-[13px]').fixedToken, '-translate-x-3');
  assert.equal(analyzer.analyzeToken('-space-y-[13px]').fixedToken, '-space-y-3');
});

test('tw tagged templates, member tags and template literals are class contexts', () => {
  const { fixed, tokens } = lint([
    'const A = tw`p-[13px]`;',
    'const B = tw.div`m-[13px]`;',
    'const C = tw(Button)`gap-[18px]`;',
    'const D = css`p-[13px]`;',
    '',
  ].join('\n'));
  assert.deepEqual(tokens, ['p-[13px]', 'm-[13px]', 'gap-[18px]']);
  assert.equal(fixed.fixed, false, 'template chunks are reported, not fixed');
});

test('outside class contexts a string needs two utility-shaped tokens', () => {
  const { fixed, tokens } = lint([
    "const one = 'p-[13px]';",
    "const custom = 'btn p-[13px]';",
    "const two = 'flex p-[13px]';",
    "const variants = 'md:p-[13px] hover:bg-blue-600';",
    "const both = 'p-[13px] m-[7px]';",
    'const chunks = `p-[13px] ${a} items-center`;',
    "label('end-to-end p-[13px] tests');",
    '',
  ].join('\n'));
  assert.deepEqual(tokens, ['p-[13px]', 'md:p-[13px]', 'p-[13px]', 'm-[7px]', 'p-[13px]']);
  assert.match(fixed.output, /const two = 'flex p-3';/);
  assert.match(fixed.output, /const one = 'p-\[13px\]';/);
});

test('classFunctions and classContexts extend the defaults', () => {
  const code = [
    "styles('p-[13px]');",
    "cn('m-[13px]');",
    'export const A = () => <div tw="gap-[18px]" className="p-[7px]" itemClasses="m-[7px]" />;',
    '',
  ].join('\n');
  assert.deepEqual(lint(code).tokens, ['m-[13px]', 'p-[7px]']);
  assert.deepEqual(
    lint(code, { classContexts: ['tw', '*Classes'], classFunctions: ['styles'] }).tokens,
    ['p-[13px]', 'm-[13px]', 'gap-[18px]', 'p-[7px]', 'm-[7px]'],
  );
});

test('the options are validated by the schema', () => {
  const linter = new Linter();
  const config = {
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', { classFunctions: 'cn' }] },
  };
  assert.throws(() => linter.verify('x', config), /Value "cn" should be array/);
});

test('the utility-shaped test is conservative', () => {
  for (const token of ['p-[13px]', 'md:p-4', 'hover:bg-blue-600', '!-mt-2', 'w-1/2', 'text-sm', 'w-full', 'flex', 'items-center', 'bg-[#fff]', 'w-(--x)']) {
    assert.equal(isUtilityShaped(token), true, token);
  }
  for (const token of ['Error', 'string', 'release', 'notes', 'p', 'Note:', 'http://x', 'e-mail', 'state-of-the-art', '13px']) {
    assert.equal(isUtilityShaped(token), false, token);
  }
  assert.equal(countUtilityShapedTokens('Error in p-[13px] string'), 1);
  assert.equal(countUtilityShapedTokens('flex items-center p-[13px]'), 3);
});

test('Tailwind has no negative padding or gap: reported as before, with no fix and no -p-3 (cs-08)', () => {
  const { fixed, tokens } = lint("cn('-p-[13px] p-[-13px] -gap-[13px] gap-x-[-13px] -px-[-13px] -scroll-pt-[13px] -m-[13px] -inset-[13px]');");
  assert.deepEqual(tokens, ['-p-[13px]', 'p-[-13px]', '-gap-[13px]', 'gap-x-[-13px]', '-px-[-13px]', '-scroll-pt-[13px]', '-m-[13px]', '-inset-[13px]']);
  assert.equal(fixed.output, "cn('-p-[13px] p-[-13px] -gap-[13px] gap-x-[-13px] -px-[-13px] -scroll-pt-[13px] -m-3 -inset-3');");

  const linter = new Linter();
  const messages = linter.verify("cn('-p-[13px] gap-[-13px] -m-[13px]');", {
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', { scale: SCALE }] },
  }).map(({ message }) => message);
  assert.deepEqual(messages, [
    'Unexpected Tailwind arbitrary spacing value "-p-[13px]". Padding and gap cannot be negative, so this class has no effect.',
    'Unexpected Tailwind arbitrary spacing value "gap-[-13px]". Padding and gap cannot be negative, so this class has no effect.',
    'Unexpected Tailwind arbitrary spacing value "-m-[13px]". Use "-m-3" (12px) or "-m-4" (16px).',
  ]);
  for (const message of messages.slice(0, 2)) {
    assert.doesNotMatch(message, /"-(?:p|gap)-\d/);
  }
});

test('negative padding on the scale stays unreported, and allowNegative false keeps its message (cs-08)', () => {
  assert.deepEqual(lint("cn('-p-[12px] gap-[-16px]');").tokens, []);
  const linter = new Linter();
  const messages = linter.verify("cn('-p-[13px]');", {
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', { allowNegative: false, scale: SCALE }] },
  });
  assert.equal(messages[0].message, 'Unexpected Tailwind arbitrary spacing value "-p-[13px]". Negative values are disabled for this rule.');
});
