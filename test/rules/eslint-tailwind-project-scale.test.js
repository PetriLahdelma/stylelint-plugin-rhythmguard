'use strict';

/**
 * `tailwind-class-use-scale` reads the project's scale the way the Stylelint
 * rules do, without running project code (cs-03, ds-03, eb-03): `scaleSources`,
 * a Tailwind v4 CSS entry (`tailwindCss`), `preset`, `scale: "auto"` with the
 * nearest `.rhythmguardrc.json` and its decisions, and an mtime cache.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Linter } = require('eslint');

const eslintPlugin = require('../../src/eslint');

const RULE = 'rhythmguard-tailwind/tailwind-class-use-scale';
const REFERENCE = path.join(__dirname, '..', 'fixtures', 'reference-user');
// The reference user's hand-typed array: Style Dictionary writes it from the
// `space.*` tokens into allowed-tokens.json, and eslint.config.js reads it back.
const SPACING_SCALE_PX = [0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 22, 24, 28, 32, 40, 48, 64];

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-eslint-scale-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function lint(dir, code, options, file = 'src/view.jsx') {
  const linter = new Linter({ cwd: dir });
  const config = [{
    files: ['**/*.jsx', '**/*.js'],
    languageOptions: { ecmaVersion: 'latest', parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' },
    plugins: { 'rhythmguard-tailwind': eslintPlugin },
    rules: { [RULE]: ['error', options] },
  }];
  const filename = path.join(dir, file);
  const messages = linter.verify(code, config, filename);
  assert.deepEqual(messages.filter(({ fatal }) => fatal), [], 'the code parses');
  return { fixed: linter.verifyAndFix(code, config, filename), messages };
}

function shape(messages) {
  return messages.map(({ column, endColumn, fix, line, message, messageId, suggestions = [] }) => ({
    column,
    endColumn,
    fix: fix ? fix.text : null,
    line,
    message,
    messageId,
    suggestions: suggestions.map((suggestion) => suggestion.fix.text),
  }));
}

// Every px value from 0 to 80, in px and in rem, plus variants and negatives.
const PROBE = [
  'export const Probe = () => (',
  '  <>',
  ...Array.from({ length: 81 }, (unused, px) => `    <div className="p-[${px}px] md:gap-[${px / 16}rem] -mt-[${px}px]" />`),
  '  </>',
  ');',
  '',
].join('\n');

test('exit criterion: the reference user\'s config with scale "auto" and scaleSources reports exactly what its hand-typed array does', () => {
  const dir = project({});
  fs.cpSync(path.join(REFERENCE, 'tokens'), path.join(dir, 'tokens'), { recursive: true });
  const scaleSources = ['tokens/primitive.json', 'tokens/semantic.json'];

  const handTyped = lint(dir, PROBE, { scale: SPACING_SCALE_PX });
  const auto = lint(dir, PROBE, { scale: 'auto', scaleSources });
  const implied = lint(dir, PROBE, { scaleSources });

  assert.ok(handTyped.messages.length > 100, `the probe has findings (${handTyped.messages.length})`);
  assert.deepEqual(shape(auto.messages), shape(handTyped.messages));
  assert.deepEqual(shape(implied.messages), shape(handTyped.messages), 'scaleSources alone means "auto"');
  assert.equal(auto.fixed.output, handTyped.fixed.output);
});

test('exit criterion: every off-scale finding carries a messageId, a per-token loc and two suggestions, with no autofix', () => {
  const dir = project({});
  fs.cpSync(path.join(REFERENCE, 'tokens'), path.join(dir, 'tokens'), { recursive: true });
  const { fixed, messages } = lint(dir, PROBE, { scale: 'auto', scaleSources: ['tokens/primitive.json', 'tokens/semantic.json'] });
  const lines = PROBE.split('\n');

  for (const message of messages) {
    assert.ok(message.messageId, message.message);
    const covered = lines[message.line - 1].slice(message.column - 1, message.endColumn - 1);
    assert.equal(covered, /"([^"]+)"/.exec(message.message)[1], 'the location is the class token');
    assert.equal(message.fix, undefined, message.message);
    const value = /-\[(\d*\.?\d+)(px|rem)\]"/.exec(message.message);
    const px = Number(value[1]) * (value[2] === 'rem' ? 16 : 1);
    const expected = px > 64 ? 1 : 2;
    assert.equal(message.suggestions.length, expected, message.message);
  }
  assert.equal(fixed.fixed, false);
});

test('tailwindCss: --spacing sets the unit, --spacing-* tokens are named in a suffix and preferred in suggestions and fixes', () => {
  const dir = project({
    'src/app.css': '@import "tailwindcss";\n@theme {\n  --spacing: 2px;\n  --spacing-sm: 8px;\n  --spacing-md: 16px;\n}\n',
  });
  const code = "cn('py-[15px] -mt-[15px] m-[13px] p-[10px]');";
  const { fixed, messages } = lint(dir, code, { fixOffScale: 'nearest', tailwindCss: 'src/app.css' }, 'src/a.js');

  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "py-[15px]". Use "py-7" (14px) or "py-8" (16px). In your theme: "py-md" (16px).',
    'Unexpected Tailwind arbitrary spacing value "-mt-[15px]". Use "-mt-7" (14px) or "-mt-8" (16px). In your theme: "-mt-md" (16px).',
    'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-6" (12px) or "m-7" (14px).',
  ], 'a 2px unit writes p-7 for 14px; p-[10px] is the step p-5');
  assert.deepEqual(messages[0].suggestions.map(({ fix }) => fix.text), ['py-7', 'py-md']);
  assert.equal(fixed.output, "cn('py-7 -mt-7 m-6 p-[10px]');");

  const upper = lint(dir, "cn('py-[15.5px]');", { fixOffScale: 'nearest', tailwindCss: 'src/app.css' }, 'src/a.js');
  assert.equal(upper.fixed.output, "cn('py-md');", 'the theme utility is written for the step it holds');

  const equivalent = lint(dir, "cn('p-[16px] p-[8px] p-[12px]');", { reportEquivalents: true, tailwindCss: 'src/app.css' }, 'src/a.js');
  assert.equal(equivalent.fixed.output, "cn('p-md p-sm p-6');");
});

test('tailwindCss with --spacing: initial has no numeric utilities: the named tokens are the scale', () => {
  const dir = project({
    'src/app.css': '@theme {\n  --spacing: initial;\n  --spacing-*: initial;\n  --spacing-xs: 4px;\n  --spacing-sm: 8px;\n  --spacing-md: 16px;\n  --spacing-lg: 24px;\n}\n',
  });
  const { messages } = lint(dir, "cn('py-[15px] p-[12px] p-[24px]');", { tailwindCss: 'src/app.css' }, 'src/a.js');
  assert.deepEqual(messages.map(({ message, suggestions }) => [message, suggestions.map(({ fix }) => fix.text)]), [
    ['Unexpected Tailwind arbitrary spacing value "py-[15px]". Use scale values (nearest: 8px or 16px). In your theme: "py-sm" (8px) or "py-md" (16px).', ['py-md', 'py-sm']],
    ['Unexpected Tailwind arbitrary spacing value "p-[12px]". Use scale values (nearest: 8px or 16px). In your theme: "p-sm" (8px) or "p-md" (16px).', ['p-sm', 'p-md']],
  ]);
});

test('baseFontSize comes from the root font size of the Tailwind entry or a CSS token source', () => {
  const dir = project({
    'src/app.css': 'html { font-size: 62.5%; }\n@theme {\n  --spacing: 0.4rem;\n}\n',
  });
  // A 10px root: --spacing is 4px, and 1.3rem is 13px.
  const { messages } = lint(dir, "cn('p-[1.3rem] p-[1.2rem]');", { tailwindCss: 'src/app.css' }, 'src/a.js');
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[1.3rem]". Use "p-3" (12px) or "p-3.5" (14px).',
  ]);

  const explicit = lint(dir, "cn('p-[1.3rem]');", { baseFontSize: 16, tailwindCss: 'src/app.css' }, 'src/a.js');
  // At 16px, --spacing: 0.4rem is 6.4px, so p-3 is 19.2px.
  assert.match(explicit.messages[0].message, /Use "p-3" \(19\.2px\) or "p-3\.5" \(22\.4px\)\./, 'an explicit baseFontSize wins');
});

test('scale "auto" reads the nearest .rhythmguardrc.json token sources, and its adopt and allow decisions hold', () => {
  const dir = project({
    'packages/app/.rhythmguardrc.json': JSON.stringify({
      audit: { tokenSources: ['tokens.css'] },
      decisions: [
        { decision: 'allow', value: '10px' },
        { decision: 'adopt', value: '1.125rem' },
        { decision: 'snap', to: '12px', value: '13px' },
      ],
    }),
    'packages/app/tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; }\n',
  });
  const code = "cn('p-[10px] p-[18px] p-[13px] p-[20px]');";
  const { messages } = lint(dir, code, { scale: 'auto' }, 'packages/app/src/view.js');
  assert.deepEqual(messages.map(({ message }) => /"([^"]+)"/.exec(message)[1]), ['p-[13px]', 'p-[20px]'], 'allowed and adopted values are not findings');
  assert.match(messages[1].message, /Use "p-4" \(16px\) or "p-6" \(24px\)\.$/, 'the rc token file is the scale');

  const noDecisions = lint(dir, code, { decisions: false, scale: 'auto' }, 'packages/app/src/view.js');
  assert.equal(noDecisions.messages.length, 4);

  // Outside packages/app no rc applies: Tailwind's ladder, where 10 and 20 are steps and 18 is not.
  const elsewhere = lint(dir, code, { scale: 'auto' }, 'src/view.js');
  assert.deepEqual(elsewhere.messages.map(({ message }) => /"([^"]+)"/.exec(message)[1]), ['p-[18px]', 'p-[13px]']);
  assert.match(elsewhere.messages[0].message, /Scale: Tailwind default spacing\.$/);
});

test('an invalid decisions section or a missing source is named on the first finding of the file, once', () => {
  const dir = project({ '.rhythmguardrc.json': JSON.stringify({ decisions: [{ decision: 'maybe', value: '10px' }] }) });
  const { messages } = lint(dir, "cn('p-[13px] m-[13px]');", { scale: 'auto', scaleSources: ['tokens/missing.json'] }, 'src/a.js');
  assert.equal(messages.length, 2);
  assert.equal(
    messages[0].message,
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-3.5" (14px). Scale: Tailwind default spacing.'
      + ' No spacing tokens were found for scale "auto"; using Tailwind default spacing.'
      + ' Token source not found: tokens/missing.json.'
      + ' .rhythmguardrc.json decisions are not applied: Invalid Rhythmguard config: decisions[0].decision must be one of adopt, allow, snap, undecided.',
  );
  assert.equal(messages[1].message, 'Unexpected Tailwind arbitrary spacing value "m-[13px]". Use "m-3" (12px) or "m-3.5" (14px). Scale: Tailwind default spacing.');
});

test('preset is the scale without one, and the fallback of "auto"', () => {
  const dir = project({});
  const { messages } = lint(dir, "cn('p-[20px] p-[13px]');", { preset: 'rhythmic-4' }, 'src/a.js');
  assert.deepEqual(messages.map(({ message }) => message), [
    'Unexpected Tailwind arbitrary spacing value "p-[20px]". Use "p-4" (16px) or "p-6" (24px).',
    'Unexpected Tailwind arbitrary spacing value "p-[13px]". Use "p-3" (12px) or "p-4" (16px).',
  ]);

  const fallback = lint(dir, "cn('p-[20px]');", { preset: 'rhythmic-4', scale: 'auto' }, 'src/a.js');
  assert.equal(fallback.messages[0].message, 'Unexpected Tailwind arbitrary spacing value "p-[20px]". Use "p-4" (16px) or "p-6" (24px). Scale: preset "rhythmic-4".');

  assert.throws(() => lint(dir, "cn('p-[20px]');", { preset: 'nope' }, 'src/a.js'), /should be equal to one of the allowed values/);
});

test('a token file edit is picked up on the next lint (mtime cache)', () => {
  const dir = project({ 'tokens.css': ':root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }\n' });
  const options = { scale: 'auto', scaleSources: ['tokens.css'] };
  assert.equal(lint(dir, "cn('p-[13px]');", options, 'a.js').messages.length, 1);

  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root { --space-1: 4px; --space-2: 8px; --space-3: 13px; --space-4: 16px; }\n');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(dir, 'tokens.css'), later, later);
  assert.equal(lint(dir, "cn('p-[13px]');", options, 'a.js').messages.length, 0);
});

test('no repository file makes the rule run code; only tailwindConfigPath in the ESLint config does (#397)', () => {
  const marker = `__rhythmguardEslintLoaded${process.pid}`;
  const dir = project({
    '.rhythmguardrc.json': JSON.stringify({ audit: { tailwindConfigPath: 'tailwind.config.js' } }),
    'tailwind.config.js': `globalThis.${marker} = true;\nmodule.exports = { theme: { spacing: { 1: '4px', 2: '8px', 3: '13px', 4: '16px' } } };\n`,
  });
  const code = "cn('p-[13px]');";
  assert.equal(lint(dir, code, { scale: 'auto' }, 'a.js').messages.length, 1);
  assert.equal(globalThis[marker], undefined, 'the rc never loads the Tailwind config');

  assert.equal(lint(dir, code, { scale: 'auto', tailwindConfigPath: 'tailwind.config.js' }, 'a.js').messages.length, 0);
  assert.equal(globalThis[marker], true, 'an explicit tailwindConfigPath is loaded');
  delete globalThis[marker];
});
