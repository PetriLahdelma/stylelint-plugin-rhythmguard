'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { collectScssTokens, createTokenKindMatcher } = require('../../src/core/token-sources');

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

test('collectScssTokens reads a namespaced spacing map with at least four lengths, as GOV.UK and NHS.UK define theirs (issue #86)', () => {
  const tokens = byName(collectScssTokens([
    '$govuk-spacing-points: (',
    '  0: 0,',
    '  1: 5px,',
    '  2: 10px,',
    '  3: 15px,',
    '  4: 20px,',
    '  5: 25px,',
    ') !default;',
    '$dropdown-spacer: .125rem !default;',
    '$card-spacer-y: 1rem !default;',
    '$widget-spacing-steps: (1: 4px, 2: 8px);',
  ].join('\n'), spacing));

  assert.equal(tokens['$govuk-spacing-points.1'], '5px');
  assert.equal(tokens['$govuk-spacing-points.5'], '25px');
  assert.equal(tokens['$dropdown-spacer'], undefined, 'a namespaced scalar stays excluded');
  assert.equal(tokens['$card-spacer-y'], undefined);
  assert.equal(tokens['$widget-spacing-steps.1'], undefined, 'a namespaced map with fewer than four lengths stays excluded');
});

test('namespaced maps are only accepted for the spacing kind', () => {
  const radius = createTokenKindMatcher('radius');
  const tokens = collectScssTokens('$govuk-spacing-points: (1: 5px, 2: 10px, 3: 15px, 4: 20px);', radius);
  assert.deepEqual(tokens, []);
});

test('collectScssTokens ignores unitless numbers such as mixin parameter defaults (GOV.UK $spacing-responsive: 6)', () => {
  const tokens = byName(collectScssTokens([
    '@mixin govuk-main-wrapper($spacing-responsive: 6, $spacing-static: 4) {',
    '  padding-top: govuk-spacing($spacing-responsive);',
    '}',
    '$spacing-unit: 8;',
    '$spacing-1: 4px;',
    '$spacing-none: 0;',
  ].join('\n'), spacing));

  assert.equal(tokens['$spacing-responsive'], undefined, 'mixin parameter defaults are not tokens');
  assert.equal(tokens['$spacing-static'], undefined);
  assert.equal(tokens['$spacing-unit'], undefined, 'a unitless multiplier is not a length');
  assert.equal(tokens['$spacing-1'], '4px');
  assert.equal(tokens['$spacing-none'], '0');
});
