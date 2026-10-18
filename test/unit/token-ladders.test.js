'use strict';

/**
 * Token ladders (issue #205): a ladder can have every step on the scale and
 * still not read as a ladder. These pin the three problems the audit reports
 * and how fluid steps are evaluated at both ends.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { ladderStep, resolveTokenLadders } = require('../../src/audit/token-ladders');

function declarations(entries) {
  return new Map(entries.map(([token, ...values]) => [token, new Set(values)]));
}

test('ladderStep reads t-shirt and numeric suffixes, aliases sharing a rank', () => {
  assert.deepEqual(ladderStep('--font-size-text-xxs'), { key: '--font-size-text (sizes)', prefix: '--font-size-text', rank: -3 });
  assert.equal(ladderStep('--radius-sm').rank, ladderStep('--radius-s').rank);
  assert.equal(ladderStep('--space-12').rank, 12);
  assert.equal(ladderStep('--color-primary'), null);
});

test('a fluid body ladder: three minima collapse to 14px and the maxima creep by under 2px', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--font-size-text-xxs', 'clamp(0.875rem, 0.2vi + 0.8rem, 0.9375rem)'],
      ['--font-size-text-xs', 'clamp(0.875rem, 0.25vi + 0.8rem, 1rem)'],
      ['--font-size-text-s', 'clamp(0.875rem, 0.35vi + 0.8rem, 1.05rem)'],
      ['--font-size-text-m', 'clamp(1rem, 0.4vi + 0.9rem, 1.25rem)'],
      ['--font-size-text-l', 'clamp(1.125rem, 0.5vi + 1rem, 1.5rem)'],
    ]),
  });

  assert.equal(ladders.summary.ladders, 1);
  const [entry] = ladders.entries;
  assert.deepEqual(entry.steps.map(({ max, min }) => `${min}..${max}`), ['14px..15px', '14px..16px', '14px..16.8px', '16px..20px', '18px..24px']);
  const problems = entry.problems.map(({ end, tokens, type }) => `${type} ${end} ${tokens.join(' ')}`);
  assert.deepEqual(problems, [
    'collapsed min --font-size-text-xxs --font-size-text-xs',
    'too-close max --font-size-text-xxs --font-size-text-xs',
    'collapsed min --font-size-text-xs --font-size-text-s',
    'too-close max --font-size-text-xs --font-size-text-s',
  ]);
  assert.equal(ladders.summary.collapsed, 2);
  assert.equal(ladders.summary.tooClose, 2);
});

test('a step that is larger than the next at one end is inverted, and var() chains are followed', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--base-16', '16px'],
      ['--space-1', '4px'],
      ['--space-2', 'clamp(8px, 2vw, 32px)'],
      ['--space-3', 'clamp(12px, 3vw, var(--base-16))'],
    ]),
  });
  const [entry] = ladders.entries;
  assert.deepEqual(entry.problems.map(({ end, type }) => `${type} ${end}`), ['inverted max']);
});

test('min() and max() give one static end; calc(), colours and conflicting definitions are left out', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--gap-1', '4px'],
      ['--gap-2', 'min(5vw, 8px)'],
      ['--gap-3', 'max(2vw, 16px)'],
      ['--gap-4', 'calc(1rem + 4px)'],
      ['--gap-5', '24px', '32px'],
      ['--color-gray-100', '#f5f5f5'],
      ['--color-gray-200', '#eeeeee'],
      ['--color-gray-300', '#e0e0e0'],
    ]),
  });
  assert.equal(ladders.summary.ladders, 1);
  assert.deepEqual(ladders.entries[0].steps, [
    { max: '4px', min: '4px', token: '--gap-1' },
    { max: '8px', min: null, token: '--gap-2' },
    { max: null, min: '16px', token: '--gap-3' },
  ]);
  assert.deepEqual(ladders.entries[0].problems, []);
});

test('a clean ladder has no problems, and minStepPx is configurable', () => {
  const clean = declarations([['--space-1', '4px'], ['--space-2', '8px'], ['--space-3', '12px'], ['--space-4', '16px']]);
  assert.deepEqual(resolveTokenLadders({ declarations: clean }).entries[0].problems, []);
  assert.equal(resolveTokenLadders({ declarations: clean, minStepPx: 5 }).summary.tooClose, 3);
});

test('a ladder that aliases another step for step is folded into it, not counted twice', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--font-size-text-xs', 'clamp(0.875rem, 0.25vi + 0.8rem, 1rem)'],
      ['--font-size-text-s', 'clamp(0.875rem, 0.35vi + 0.8rem, 1.05rem)'],
      ['--font-size-text-m', 'clamp(1rem, 0.4vi + 0.9rem, 1.25rem)'],
      ['--text-dt-text-xs', 'var(--font-size-text-xs)'],
      ['--text-dt-text-s', 'var(--font-size-text-s)'],
      ['--text-dt-text-m', 'var(--font-size-text-m)'],
      // Mixed: one step is its own value, so this ladder is reported on its own.
      ['--size-mixed-1', 'var(--font-size-text-xs)'],
      ['--size-mixed-2', '20px'],
      ['--size-mixed-3', '24px'],
    ]),
  });
  assert.deepEqual(ladders.entries.map((entry) => entry.prefix), ['--font-size-text', '--size-mixed']);
  assert.deepEqual(ladders.entries[0].aliases, ['--text-dt-text']);
  assert.equal(ladders.summary.ladders, 2);
  assert.equal(ladders.summary.collapsed, 1);
});

test('the inverted floor of a retuned title ladder is reported at min only', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--font-size-title-m', 'clamp(1.75rem, 2vi + 1rem, 2.25rem)'],
      ['--font-size-title-l', 'clamp(2.75rem, 2vi + 2rem, 3.5rem)'],
      ['--font-size-title-xl', 'clamp(2rem, 4vi + 1rem, 4.5rem)'],
    ]),
  });
  assert.deepEqual(ladders.entries[0].problems.map(({ end, tokens, type }) => `${type} ${end} ${tokens.join(' ')}`), [
    'inverted min --font-size-title-l --font-size-title-xl',
  ]);
});

test('a ladder of negative steps is compared by magnitude, not read as inverted (issue #294)', () => {
  const ladders = resolveTokenLadders({
    declarations: declarations([
      ['--space-negative-1', '-4px'],
      ['--space-negative-2', '-8px'],
      ['--space-negative-3', '-16px'],
    ]),
  });
  assert.equal(ladders.summary.ladders, 1);
  assert.deepEqual(ladders.entries[0].problems, []);
  assert.deepEqual(ladders.entries[0].steps.map(({ min }) => min), ['-4px', '-8px', '-16px'], 'steps keep their sign');

  const broken = resolveTokenLadders({
    declarations: declarations([
      ['--space-negative-1', '-4px'],
      ['--space-negative-2', '-3px'],
      ['--space-negative-3', '-4px'],
    ]),
  });
  assert.deepEqual(broken.entries[0].problems.map(({ end, tokens, type }) => `${type} ${end} ${tokens.join(' ')}`), [
    'inverted both --space-negative-1 --space-negative-2',
    'too-close both --space-negative-2 --space-negative-3',
  ]);

  const crossing = resolveTokenLadders({
    declarations: declarations([
      ['--offset-1', '-4px'],
      ['--offset-2', '0px'],
      ['--offset-3', '4px'],
    ]),
  });
  assert.deepEqual(crossing.entries[0].problems, [], 'a ladder that crosses zero keeps its signed order');
});
