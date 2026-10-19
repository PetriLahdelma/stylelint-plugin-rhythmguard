'use strict';

/**
 * The Design Tokens Community Group's own 2025.10 conformance fixtures, read
 * through the token source reader (issue #163).
 *
 * Fixtures: test/fixtures/dtcg-test-suite/, vendored from
 * design-tokens/community-group, path test-suite/tests/2025.10/format/, at
 * commit 8e4381962f2589bcb359dab38c6664dbb1e1058f (W3C 3-clause BSD License,
 * see the README and LICENSE.md there).
 *
 * How the manifest maps to assertions:
 *
 * - The suite names its tokens after the type (`dimension`, `dimensions.large`),
 *   so they are not spacing names. Every case is read with token kind `all`,
 *   which reads every name; the positive dimension cases are also read nested
 *   in a `spacing` group with the default spacing kind, the way a real token
 *   file names its scale.
 * - PositiveEvaluationTest: each dimension token is read with the right px
 *   value and the file gives no warning. Composite, color and other non-length
 *   tokens are not read. A positive case that references a `ms` duration gets
 *   the skip warning every non-px, non-rem unit gets.
 * - NegativeEvaluationTest: the invalid token yields no length, and the reader
 *   never throws. A malformed dimension, a dimension in another unit and a
 *   `$ref` that names nothing or a bare number are skipped with a warning that
 *   says why. Two cases are documented in place: a `{}` reference cycle keeps
 *   its text, as every `{}` reference that cannot be followed does (issue
 *   #267), so it has no length; and the reader goes by token names, not
 *   `$type`, so a color token that aliases a dimension (reference-type-mismatch)
 *   is not read as spacing but is read under kind `all`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { getNormalizedValueKeys, parseTokenSources } = require('../../src/core/token-sources');

const SUITE_COMMIT = '8e4381962f2589bcb359dab38c6664dbb1e1058f';
const suiteRoot = path.join(__dirname, '..', 'fixtures', 'dtcg-test-suite');
const formatDir = path.join(suiteRoot, 'tests', '2025.10', 'format');
const manifest = JSON.parse(fs.readFileSync(path.join(formatDir, 'manifest.json'), 'utf8'));

/**
 * Expected outcome per manifest id. `tokens`: every token the file yields
 * under kind `all`, as token -> raw value, with the px value for lengths.
 * `skipped`: tokens left out with a warning, and the reason the warning gives.
 */
const EXPECTED = {
  'dimension-px-basic': { tokens: { '--dimension': ['16px', '16px'] } },
  'dimension-rem-basic': { tokens: { '--dimension': ['2rem', '32px'] } },
  'dimension-fractional-value': { tokens: { '--dimension': ['0.5rem', '8px'] } },
  'dimension-zero-value': { tokens: { '--dimension': ['0px', '0px'] } },
  'dimension-extreme-values': {
    tokens: {
      '--dimensions-large': ['9999.99px', '9999.99px'],
      '--dimensions-tiny': ['0.001rem', '0.016px'],
    },
  },
  'dimension-missing-unit': { skipped: { '--invalid-dimension': /needs a number "value" and a "unit"/ }, tokens: {} },
  'dimension-missing-value': { skipped: { '--invalid-dimension': /needs a number "value" and a "unit"/ }, tokens: {} },
  'dimension-string-value': { skipped: { '--invalid-dimension': /needs a number "value" and a "unit"/ }, tokens: {} },
  'dimension-wrong-unit': { skipped: { '--invalid-dimension': /unit "em" is not px or rem/ }, tokens: {} },

  'reference-composite-with-refs': { tokens: { '--dimensions-small': ['0px', '0px'] } },
  'reference-composite-subvalue-refs': {
    // `shadow-offsetX-value` is a number token pointing at a number: read as the number, as `$value: 0` is.
    tokens: { '--shadow-blur-only': ['0px', '0px'], '--shadow-offsetX-value': ['0', '0px'] },
  },
  'reference-cross-composite-refs': { tokens: { '--dimension-from-shadow': ['0px', '0px'] } },
  'reference-nested-composite-refs': {
    // The duration reference resolves to `{ value: 0, unit: "ms" }`: skipped like any non-px, non-rem unit.
    skipped: { '--duration-from-transition': /unit "ms" is not px or rem/ },
    tokens: { '--dimension-from-dash-array': ['0px', '0px'] },
  },
  'reference-typography-property-refs': {
    tokens: {
      '--extracted-font-family': ['sans-serif', null],
      '--extracted-font-size': ['0px', '0px'],
      '--extracted-line-height': ['0', '0px'],
    },
  },

  'reference-circular-reference-chain': {
    // A `{}` reference that cannot be followed keeps its text (issue #267): no length, nothing for the scale.
    tokens: {
      '--circular-reference-chain-1': ['{circular-reference-chain-2}', null],
      '--circular-reference-chain-2': ['{circular-reference-chain-3}', null],
      '--circular-reference-chain-3': ['{circular-reference-chain-1}', null],
    },
  },
  'reference-dimension-curly-brace-in-subvalue': {
    skipped: { '--invalid-dimension': /needs a number "value" and a "unit"/ },
    tokens: { '--numbers-number': ['16', null] },
  },
  'reference-json-pointer-incomplete-dimension': {
    skipped: { '--invalid-dimension': /"#\/dimensions\/dimension\/\$value\/value" is a number, not a dimension/ },
    tokens: { '--dimensions-dimension': ['0px', '0px'] },
  },
  'reference-json-pointer-type-mismatch': {
    skipped: { '--invalid-dimension': /"#\/colors\/color\/\$value\/components\/0" is a number, not a dimension/ },
    tokens: {},
  },
  'reference-json-pointer-wrong-property': {
    skipped: { '--invalid-dimension': /"#\/shadows\/shadow\/\$value\/radius" does not resolve/ },
    tokens: {},
  },
  'reference-type-mismatch': {
    // Not a spacing name, so never spacing; under kind `all` the alias resolves, since $type is not checked.
    notSpacing: ['--invalid-color'],
    tokens: { '--dimensions-dimension': ['0px', '0px'], '--invalid-color': ['0px', '0px'] },
  },
  'reference-composite-ref-wrong-subvalue-type': { tokens: { '--dimensions-dimension': ['0px', '0px'] } },
};

const entries = manifest.tests.filter((entry) => Object.prototype.hasOwnProperty.call(EXPECTED, entry.id));

function vendoredFiles(dir = formatDir, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...vendoredFiles(path.join(dir, entry.name), relative));
    } else if (relative !== 'manifest.json') {
      files.push(relative);
    }
  }
  return files.sort();
}

function read(file, options = {}) {
  const parsed = parseTokenSources({ sources: [{ format: 'dtcg', path: file }], tokenKind: options.tokenKind || 'all' });
  const values = Object.fromEntries([...parsed.definitions].map(([token, definition]) => [token, [...definition.values]]));
  return { ...parsed, values };
}

function pxOf(value) {
  const px = getNormalizedValueKeys(value).find((key) => /^-?[\d.]+px$/.test(key));
  return px === undefined ? null : px;
}

test(`the vendored suite is the manifest at ${SUITE_COMMIT.slice(0, 7)}, and every vendored case is mapped`, () => {
  assert.equal(manifest.version, '2025.10');
  assert.match(fs.readFileSync(path.join(suiteRoot, 'README.md'), 'utf8'), new RegExp(SUITE_COMMIT));

  // Every dimension case in the manifest is vendored and has an expectation.
  const dimensionCases = manifest.tests.filter((entry) => /^(?:positive|negative)\/dimensions\//.test(entry.input));
  assert.ok(dimensionCases.length >= 9);
  for (const entry of dimensionCases) {
    assert.ok(EXPECTED[entry.id], `no expectation for ${entry.id}`);
  }

  // Every vendored file is a manifest case with an expectation, and every expectation has its file.
  assert.deepEqual(vendoredFiles(), entries.map((entry) => entry.input).sort());
  assert.equal(entries.length, Object.keys(EXPECTED).length);
});

for (const entry of entries) {
  const expected = EXPECTED[entry.id];
  const positive = entry.type === 'PositiveEvaluationTest';

  test(`DTCG suite ${entry.type === 'PositiveEvaluationTest' ? 'positive' : 'negative'}: ${entry.id} (${entry.input})`, () => {
    assert.ok(['PositiveEvaluationTest', 'NegativeEvaluationTest'].includes(entry.type));
    assert.equal(entry.input.startsWith(positive ? 'positive/' : 'negative/'), true);

    const file = path.join(formatDir, entry.input);
    let parsed;
    assert.doesNotThrow(() => {
      parsed = read(file);
    });

    const actual = Object.fromEntries(Object.entries(parsed.values).map(([token, values]) => {
      assert.equal(values.length, 1, `${token} has one value`);
      return [token, [values[0], pxOf(values[0])]];
    }));
    assert.deepEqual(actual, expected.tokens);

    const skipped = expected.skipped || {};
    assert.equal(parsed.sources.length, 1);
    if (Object.keys(skipped).length === 0) {
      assert.deepEqual(parsed.warnings, [], `${entry.id} reads without warnings`);
    } else {
      assert.equal(parsed.warnings.length, 1, parsed.warnings.join('\n'));
      const [warning] = parsed.warnings;
      assert.match(warning, new RegExp(`^Token source ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: skipped `));
      for (const [token, reason] of Object.entries(skipped)) {
        const part = warning.split(/, (?=--)/).find((item) => item.includes(`${token} (`));
        assert.ok(part, `${token} is named in: ${warning}`);
        assert.match(part, reason);
        assert.equal(Object.prototype.hasOwnProperty.call(parsed.values, token), false);
      }
    }
    assert.equal(parsed.sources[0].tokenCount, Object.keys(expected.tokens).length);

    for (const token of expected.notSpacing || []) {
      assert.equal(read(file, { tokenKind: 'spacing' }).definitions.has(token), false);
    }
    if (!positive) {
      // Whatever a negative case keeps, its invalid tokens carry no length.
      for (const [token, [, px]] of Object.entries(expected.tokens)) {
        if (/invalid|circular/.test(token) && !(expected.notSpacing || []).includes(token)) {
          assert.equal(px, null, token);
        }
      }
    }
  });
}

test('the positive dimension cases read the same px values as spacing tokens, nested in a spacing group', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-dtcg-suite-'));
  for (const entry of entries.filter((item) => item.type === 'PositiveEvaluationTest' && item.input.startsWith('positive/dimensions/'))) {
    // eslint-disable-next-line no-unused-vars
    const { $schema, $description, ...tokens } = JSON.parse(fs.readFileSync(path.join(formatDir, entry.input), 'utf8'));
    const file = path.join(dir, `${entry.id}.json`);
    fs.writeFileSync(file, JSON.stringify({ spacing: tokens }));

    const parsed = read(file, { tokenKind: 'spacing' });
    const expected = Object.fromEntries(Object.entries(EXPECTED[entry.id].tokens).map(([token, value]) => [token.replace(/^--/, '--spacing-'), value]));
    const actual = Object.fromEntries(Object.entries(parsed.values).map(([token, [value]]) => [token, [value, pxOf(value)]]));
    assert.deepEqual(actual, expected, entry.id);
    assert.deepEqual(parsed.warnings, [], entry.id);
  }
});
