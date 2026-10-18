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
