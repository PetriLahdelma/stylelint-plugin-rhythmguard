'use strict';

/**
 * Systems like mittwald Flow put the discipline in a token layer: components
 * reference `--button--padding-x`, which references `--size-px--m`, which is a
 * length. A literal scan sees nothing there. The chain audit follows var()
 * references to their terminal values and says whether each spacing token ends
 * on the scale, off it, nowhere, or in several places at once.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveTokenChains } = require('../../src/audit/token-chains');

const declarations = (entries) => new Map(Object.entries(entries).map(([token, values]) => [token, new Set([].concat(values))]));
const scale = [0, 4, 8, 16, 24, 32];

test('resolveTokenChains classifies every spacing token by where its chain ends', () => {
  const chains = resolveTokenChains({
    baseFontSize: 16,
    declarations: declarations({
      '--size-m': '16px',
      '--size-odd': '13px',
      '--button-padding': 'var(--size-m)',
      '--card-gap': 'var(--size-odd)',
      '--chip-padding': '13px',
      '--modal-inset': 'var(--missing)',
      '--drawer-margin': 'var(--missing, 8px)',
      '--stack-gap': 'calc(var(--size-m) * 2)',
      '--content-margin': '1rem 2rem',
      '--color-primary': 'var(--blue)',
    }),
    scale,
  });

  const byToken = Object.fromEntries(chains.entries.map((entry) => [entry.token, entry]));
  assert.equal(byToken['--size-m'].outcome, 'on-scale');
  assert.equal(byToken['--button-padding'].outcome, 'on-scale');
  assert.deepEqual(byToken['--button-padding'].via, ['--size-m']);
  assert.deepEqual(byToken['--button-padding'].terminals, ['16px']);
  assert.equal(byToken['--card-gap'].outcome, 'off-scale');
  assert.deepEqual(byToken['--card-gap'].terminals, ['13px']);
  assert.equal(byToken['--chip-padding'].outcome, 'off-scale');
  assert.equal(byToken['--modal-inset'].outcome, 'unresolved');
  assert.equal(byToken['--drawer-margin'].outcome, 'on-scale', 'a fallback is used when the reference is undeclared');
  assert.equal(byToken['--stack-gap'].outcome, 'computed');
  assert.equal(byToken['--content-margin'].outcome, 'non-length');
  assert.equal(byToken['--color-primary'], undefined, 'non-spacing names are not chains');
  assert.deepEqual(chains.summary, { total: 9, 'on-scale': 3, 'off-scale': 3, unresolved: 1, ambiguous: 0, computed: 1, 'non-length': 1 });
});

test('resolveTokenChains terminates on cycles and reports several definitions as ambiguous', () => {
  const chains = resolveTokenChains({
    baseFontSize: 16,
    declarations: declarations({
      '--gap-a': 'var(--gap-b)',
      '--gap-b': 'var(--gap-a)',
      '--themed-padding': ['16px', '20px'],
      '--section-spacing': 'var(--themed-padding)',
    }),
    scale,
  });
  const byToken = Object.fromEntries(chains.entries.map((entry) => [entry.token, entry]));
  assert.equal(byToken['--gap-a'].outcome, 'unresolved');
  assert.equal(byToken['--gap-b'].outcome, 'unresolved');
  assert.equal(byToken['--themed-padding'].outcome, 'ambiguous');
  assert.deepEqual(byToken['--themed-padding'].terminals, ['16px', '20px']);
  assert.equal(byToken['--section-spacing'].outcome, 'ambiguous');
});
