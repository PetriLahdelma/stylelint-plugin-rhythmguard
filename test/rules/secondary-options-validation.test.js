'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

test('use-scale rejects unknown secondary option names', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          sevverity: 'warning',
        },
      ],
    },
  });

  assert.equal(result.errored, true);
  assert.ok(
    result.invalidOptionWarnings.some((warning) =>
      /Invalid option name "sevverity"/.test(warning.text),
    ),
  );
});

test('use-scale rejects unsupported property names', async () => {
  const result = await lintCss({
    code: '.card { margin: 12px; }',
    rules: {
      'rhythmguard/use-scale': [
        true,
        {
          properties: ['marging'],
        },
      ],
    },
  });

  assert.equal(result.errored, true);
  assert.ok(
    result.invalidOptionWarnings.some((warning) =>
      /option "properties" of rule "rhythmguard\/use-scale"/.test(warning.text),
    ),
  );
});

test('prefer-token rejects non-array properties option', async () => {
  const result = await lintCss({
    code: '.stack { gap: 12px; }',
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          properties: 'gap',
        },
      ],
    },
  });

  assert.equal(result.errored, true);
  assert.ok(
    result.invalidOptionWarnings.some((warning) =>
      /option "properties" of rule "rhythmguard\/prefer-token"/.test(warning.text),
    ),
  );
});

test('no-offscale-transform rejects non-array scale option', async () => {
  const result = await lintCss({
    code: '.chip { transform: translateY(16px); }',
    rules: {
      'rhythmguard/no-offscale-transform': [
        true,
        {
          scale: '16px',
        },
      ],
    },
  });

  assert.equal(result.errored, true);
  assert.ok(
    result.invalidOptionWarnings.some((warning) =>
      /option "scale" of rule "rhythmguard\/no-offscale-transform"/.test(
        warning.text,
      ),
    ),
  );
});

// Issue #222: an invalid tokenPattern is reported on the root, and the run
// goes on with the default pattern instead of throwing inside Stylelint.
for (const ruleName of ['rhythmguard/use-scale', 'rhythmguard/prefer-token']) {
  test(`${ruleName} reports an invalid tokenPattern instead of throwing`, async () => {
    const options = ruleName === 'rhythmguard/prefer-token' ? { tokenPattern: '[' } : { tokenPattern: '[', fixWith: 'token' };
    const result = await lintCss({
      code: '.a { padding: 13px; }',
      rules: { [ruleName]: [true, options] },
    });
    const texts = result.warnings.map((warning) => warning.text);
    assert.equal(texts.filter((text) => text.includes('Invalid tokenPattern regex: [')).length, 1, texts.join('\n'));
    assert.ok(texts.length >= 2, `the file is still linted: ${texts.join('\n')}`);
  });
}

// Issue #273: shapes that silently disabled a rule are invalid options; the
// documented preset-name form of a propertyScales entry is accepted.
const SILENT_NO_OP_OPTIONS = [
  ['scale', { scale: ['auto'] }],
  ['scale', { scale: [16, 'auto'] }],
  ['scale', { scale: [] }],
  ['customScale', { customScale: [] }],
  ['scales', { scales: { spacing: [] } }],
  ['scales', { scales: { spacing: { preset: 'nope' } } }],
  ['scales', { scales: { spacing: { scale: [] } } }],
  ['propertyScales', { propertyScales: { padding: [] } }],
  ['propertyScales', { propertyScales: { padding: { preset: 'nope' } } }],
  ['propertyScales', { propertyScales: { padding: 'nope' } }],
  ['propertyScales', { propertyScales: { padding: { customScale: [] } } }],
];

for (const ruleName of ['rhythmguard/use-scale', 'rhythmguard/prefer-token', 'rhythmguard/no-offscale-transform']) {
  for (const [optionName, options] of SILENT_NO_OP_OPTIONS) {
    if (ruleName === 'rhythmguard/no-offscale-transform' && /^(scales|propertyScales)$/.test(optionName)) {
      continue;
    }
    test(`${ruleName} rejects ${JSON.stringify(options)} (#273)`, async () => {
      const result = await lintCss({ code: '.a { padding: 13px; transform: translateX(13px); }', rules: { [ruleName]: [true, options] } });
      assert.equal(result.errored, true);
      assert.ok(
        result.invalidOptionWarnings.some((warning) => warning.text.includes(`option "${optionName}" of rule "${ruleName}"`)),
        result.invalidOptionWarnings.map((warning) => warning.text).join('\n') || 'no invalid option warning',
      );
    });
  }
}

test('scale "auto", a preset name in scales and a known preset object stay valid (#273)', async () => {
  for (const options of [{ scale: 'auto' }, { scales: { spacing: 'rhythmic-8' } }, { scales: { spacing: { preset: 'rhythmic-8' } } }, { propertyScales: { padding: { preset: 'rhythmic-8' } } }]) {
    const result = await lintCss({ code: '.a { padding: 13px; }', rules: { 'rhythmguard/use-scale': [true, options] } });
    assert.deepEqual(result.invalidOptionWarnings, [], JSON.stringify(options));
  }
});

test('a propertyScales entry may be a preset name, as documented (#273)', async () => {
  const result = await lintCss({
    code: '.a { padding: 12px; margin: 12px; }',
    rules: { 'rhythmguard/use-scale': [true, { propertyScales: { padding: 'rhythmic-8' }, scale: [0, 4, 8, 12, 16] }] },
  });

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Unexpected off-scale value "12px". Use scale values (nearest: 8px or 16px). (rhythmguard/use-scale)',
  ]);

  const token = await lintCss({
    code: '.a { padding: 12px; }',
    rules: { 'rhythmguard/prefer-token': [true, { allowNumericScale: true, propertyScales: { padding: 'rhythmic-8' } }] },
  });
  assert.deepEqual(token.invalidOptionWarnings, []);
  assert.equal(token.warnings.length, 1);
});
