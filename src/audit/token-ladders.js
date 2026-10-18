'use strict';

const valueParser = require('postcss-value-parser');
const { formatLength, numbersEqual, parseLengthToken, toPx } = require('../core/length');

/**
 * Token ladders (issue #205). A ladder is a set of custom properties that
 * share a prefix and differ by a size step: `--font-size-text-xxs` to
 * `-xxl`, `--space-1` to `--space-9`, `--radius-sm/md/lg`. Every step can be
 * on the scale and the ladder still be broken, so each step is evaluated at
 * its smallest and largest value (a static length, a clamp() minimum and
 * maximum, the static arguments of min() and max(), followed through var())
 * and adjacent steps are compared at both ends:
 *
 *   collapsed    two steps render the same size at one end
 *   too-close    two steps differ by less than `minStepPx` (default 2px)
 *   inverted     a step is larger than the next one at one end
 *
 * Each problem names the end it occurs at: `min`, `max`, or `both`.
 *
 * A step that cannot be evaluated (calc(), a viewport length, a token with
 * several different definitions) is left out of the comparison. A ladder
 * that only aliases another one step for step is folded into it.
 */
const DEFAULT_MIN_STEP_PX = 2;
const MIN_LADDER_STEPS = 3;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/i;

// T-shirt steps in order. Aliases share a rank (sm and s, 2xl and xxl).
const SIZE_RANKS = new Map([
  ['xxxs', -4], ['3xs', -4], ['xxs', -3], ['2xs', -3], ['xs', -2],
  ['s', -1], ['sm', -1], ['small', -1],
  ['m', 0], ['md', 0], ['medium', 0], ['base', 0],
  ['l', 1], ['lg', 1], ['large', 1],
  ['xl', 2], ['xxl', 3], ['2xl', 3], ['xxxl', 4], ['3xl', 4],
  ['4xl', 5], ['5xl', 6], ['6xl', 7], ['7xl', 8], ['8xl', 9], ['9xl', 10],
]);
const STEP_SUFFIX = /^(--[\w-]+?)-([a-z0-9]+)$/i;

/** The ladder a token belongs to and its rank on it, or null. */
function ladderStep(token) {
  const match = token.match(STEP_SUFFIX);
  if (!match) {
    return null;
  }
  const [, prefix, suffix] = match;
  const lower = suffix.toLowerCase();
  if (SIZE_RANKS.has(lower)) {
    return { key: `${prefix} (sizes)`, prefix, rank: SIZE_RANKS.get(lower) };
  }
  if (/^\d+$/.test(lower)) {
    return { key: `${prefix} (numbers)`, prefix, rank: Number(lower) };
  }
  return null;
}

function splitArguments(fnNode) {
  const args = [[]];
  for (const node of fnNode.nodes) {
    if (node.type === 'div' && node.value === ',') {
      args.push([]);
    } else {
      args[args.length - 1].push(node);
    }
  }
  return args.map((nodes) => valueParser.stringify(nodes).trim());
}

function createEvaluator(declarations, baseFontSize) {
  const memo = new Map();

  const evaluateToken = (token, seen) => {
    if (memo.has(token)) return memo.get(token);
    const values = declarations.get(token);
    if (!values || seen.has(token)) return null;
    const ranges = [...values].map((value) => evaluate(value, new Set([...seen, token])));
    const [first] = ranges;
    const agree = first && ranges.every((range) => range && sameEnd(range.min, first.min) && sameEnd(range.max, first.max));
    const result = agree ? first : null;
    memo.set(token, result);
    return result;
  };

  // { min, max } in px; an end is null when the value has no static bound there.
  const evaluate = (raw, seen = new Set()) => {
    const value = String(raw).trim();
    const reference = value.match(VAR_REFERENCE);
    if (reference) {
      const [, target, fallback] = reference;
      if (declarations.has(target)) return evaluateToken(target, seen);
      return fallback === undefined ? null : evaluate(fallback, seen);
    }
    const parsed = valueParser(value).nodes.filter((node) => node.type !== 'space');
    if (parsed.length !== 1) return null;
    const [node] = parsed;
    if (node.type === 'word') {
      const length = parseLengthToken(node.value);
      if (!length || !length.unit || length.unit === '%') return null;
      const px = toPx(Math.abs(length.number), length.unit, baseFontSize);
      if (px === null) return null;
      const signed = length.number < 0 ? -px : px;
      return { max: signed, min: signed };
    }
    if (node.type !== 'function') return null;
    const name = node.value.toLowerCase();
    const args = splitArguments(node).map((arg) => evaluate(arg, seen));
    if (name === 'clamp') {
      if (args.length !== 3 || !args[0] || !args[2] || args[0].min === null || args[2].max === null) return null;
      return { max: args[2].max, min: args[0].min };
    }
    if (name === 'min' || name === 'max') {
      const statics = args.filter((range) => range && range.min !== null && range.max !== null);
      if (statics.length === 0) return null;
      const pick = name === 'min' ? Math.min : Math.max;
      const all = statics.length === args.length;
      // min(5vw, 2rem) is at most 2rem and has no static minimum; max() mirrors it.
      return {
        max: name === 'min' || all ? pick(...statics.map((range) => range.max)) : null,
        min: name === 'max' || all ? pick(...statics.map((range) => range.min)) : null,
      };
    }
    return null;
  };

  return { evaluate, evaluateToken };
}

function sameEnd(a, b) {
  return (a === null && b === null) || (a !== null && b !== null && numbersEqual(a, b));
}

/**
 * The ranges adjacent steps are compared on. A ladder whose every step is
 * negative (`--space-negative-1: -4px` to `-3: -16px`) grows in magnitude, so
 * it is compared by magnitude, its `min` end being the smaller magnitude
 * (issue #294). A ladder that crosses zero keeps its signed order.
 */
function comparableSteps(steps) {
  const negative = steps.every((step) => {
    const ends = [step.min, step.max].filter((end) => end !== null);
    return ends.length > 0 && ends.every((end) => end < 0);
  });
  if (!negative) {
    return steps;
  }
  return steps.map((step) => ({
    max: step.min === null ? null : -step.min,
    min: step.max === null ? null : -step.max,
  }));
}

function compareEnds(lower, upper, end, minStepPx) {
  const a = lower[end];
  const b = upper[end];
  if (a === null || b === null) return null;
  if (numbersEqual(a, b)) return { type: 'collapsed' };
  if (a > b) return { type: 'inverted' };
  if (b - a < minStepPx) return { difference: Math.round((b - a) * 1000) / 1000, type: 'too-close' };
  return null;
}

/**
 * Every ladder of at least three evaluable steps, with the problems between
 * adjacent steps. `declarations` is the token-chain map: token to the set of
 * values it is declared with.
 */
function resolveTokenLadders({ baseFontSize = 16, declarations, minStepPx = DEFAULT_MIN_STEP_PX }) {
  const { evaluateToken } = createEvaluator(declarations, baseFontSize);
  const ladders = new Map();
  for (const token of declarations.keys()) {
    const step = ladderStep(token);
    if (!step) continue;
    const range = evaluateToken(token, new Set());
    if (!range) continue;
    if (!ladders.has(step.key)) ladders.set(step.key, { prefix: step.prefix, steps: [] });
    const ladder = ladders.get(step.key);
    // An alias for a rank already on the ladder (s next to sm) is not a step.
    if (ladder.steps.some((existing) => existing.rank === step.rank)) continue;
    ladder.steps.push({ max: range.max, min: range.min, rank: step.rank, token });
  }

  const eligible = [...ladders.values()].filter((ladder) => ladder.steps.length >= MIN_LADDER_STEPS);
  const ladderOfToken = new Map();
  for (const ladder of eligible) {
    for (const step of ladder.steps) ladderOfToken.set(step.token, ladder);
  }
  // A ladder whose every step is a var() alias of a step on one other ladder
  // (Tailwind @theme names over a token file) has that ladder's problems, not
  // its own. It is listed under the other ladder's `aliases` and not counted.
  const aliasTarget = (ladder) => {
    let target = null;
    for (const step of ladder.steps) {
      const values = declarations.get(step.token);
      const reference = values && values.size === 1 ? [...values][0].trim().match(VAR_REFERENCE) : null;
      const owner = reference ? ladderOfToken.get(reference[1]) : null;
      if (!owner || owner === ladder || (target && owner !== target)) return null;
      target = owner;
    }
    return target;
  };
  const aliases = new Map();
  for (const ladder of eligible) {
    const target = aliasTarget(ladder);
    if (target && !aliasTarget(target)) {
      aliases.set(ladder, target);
      target.aliases = [...(target.aliases || []), ladder.prefix].sort();
    }
  }

  const entries = [];
  for (const ladder of eligible) {
    if (aliases.has(ladder)) continue;
    const steps = ladder.steps.sort((a, b) => a.rank - b.rank);
    const compared = comparableSteps(steps);
    const problems = [];
    for (let index = 0; index < steps.length - 1; index += 1) {
      const tokens = [steps[index].token, steps[index + 1].token];
      const atMin = compareEnds(compared[index], compared[index + 1], 'min', minStepPx);
      const atMax = compareEnds(compared[index], compared[index + 1], 'max', minStepPx);
      // The same problem at both ends (always, for static steps) is one problem.
      if (atMin && atMax && atMin.type === atMax.type && atMin.difference === atMax.difference) {
        problems.push({ end: 'both', tokens, ...atMin });
        continue;
      }
      if (atMin) problems.push({ end: 'min', tokens, ...atMin });
      if (atMax) problems.push({ end: 'max', tokens, ...atMax });
    }
    entries.push({
      ...(ladder.aliases ? { aliases: ladder.aliases } : {}),
      prefix: ladder.prefix,
      problems,
      steps: steps.map(({ max, min, token }) => ({
        max: max === null ? null : formatLength(max, 'px'),
        min: min === null ? null : formatLength(min, 'px'),
        token,
      })),
    });
  }
  entries.sort((a, b) => a.prefix.localeCompare(b.prefix));

  const count = (type) => entries.reduce((sum, entry) => sum + entry.problems.filter((problem) => problem.type === type).length, 0);
  return {
    entries,
    summary: {
      collapsed: count('collapsed'),
      inverted: count('inverted'),
      ladders: entries.length,
      minStepPx,
      tooClose: count('too-close'),
    },
  };
}

/** The contract shape: counts for every ladder, entries only for ladders with a problem. */
function toLaddersContract(ladders) {
  return {
    entries: ladders.entries.filter((entry) => entry.problems.length > 0),
    summary: ladders.summary,
  };
}

module.exports = {
  DEFAULT_MIN_STEP_PX,
  ladderStep,
  resolveTokenLadders,
  toLaddersContract,
};
