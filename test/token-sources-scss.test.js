'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { collectScssTokens, createTokenKindMatcher } = require('../src/utils/token-sources');

const spacing = createTokenKindMatcher('spacing');
const byName = (tokens) => Object.fromEntries(tokens.map((t) => [t.token, t.value]));

test('collectScssTokens evaluates Bootstrap-style $spacer and a $spacers map with multiplication', () => {
  const tokens = collectScssTokens([
    '$spacer: 1rem !default;',
    '$spacers: (',
    '  0: 0,',
    '  1: $spacer * .25,',
    '  2: $spacer * .5,',
    '  3: $spacer,',
    '  4: $spacer * 1.5,',
    '  5: $spacer * 3,',
    ') !default;',
  ].join('\n'), spacing);

  assert.deepEqual(byName(tokens), {
    '$spacer': '1rem',
    '$spacers.0': '0',
    '$spacers.1': '0.25rem',
    '$spacers.2': '0.5rem',
    '$spacers.3': '1rem',
    '$spacers.4': '1.5rem',
    '$spacers.5': '3rem',
  });
});

test('collectScssTokens reads Carbon-style flat variables and skips non-spacing names', () => {
  const tokens = collectScssTokens([
    '$spacing-01: 0.125rem !default;',
    '$spacing-02: 0.25rem !default;',
    '$layout-01: 1rem !default;',
    '$letter-spacing-01: 0.32px;',
  ].join('\n'), spacing);

  assert.deepEqual(byName(tokens), { '$spacing-01': '0.125rem', '$spacing-02': '0.25rem' });
});

test('collectScssTokens walks nested maps, skips keywords, strings and calls it cannot evaluate, and survives cycles', () => {
  const tokens = collectScssTokens([
    '$spacing-values: ("0": 0, "1": 0.25rem, "auto": auto);',
    '$spacing-horizontal: "x";',
    '$system-spacing: (small: (1: spacing-multiple(1), 2: 16px), smaller: ("1px": 1px));',
    '$space-a: $space-b;',
    '$space-b: $space-a;',
    '$space-div: math.div(32px, 2);',
  ].join('\n'), spacing);

  assert.deepEqual(byName(tokens), {
    '$spacing-values.0': '0',
    '$spacing-values.1': '0.25rem',
    '$system-spacing.small.2': '16px',
    '$system-spacing.smaller.1px': '1px',
    '$space-div': '16px',
  });
});
