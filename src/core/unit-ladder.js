'use strict';

/**
 * Unit ladders: a spacing scale written as multiples of one custom property
 * whose length is not fixed, such as the font-metric gap
 * `--gap: calc(1rlh - 1rex)` with `calc(var(--gap) * 0.5)`, `var(--gap)`,
 * `calc(var(--gap) * 2)`. No px value can be computed, so a px scale cannot
 * hold it; the scale is the set of multipliers instead.
 */

// Units that follow the font or the line: a length built from them has no fixed px value.
const FONT_RELATIVE_LENGTH = /(?:^|[\s(*/+-])-?\d*\.?\d+(?:rlh|lh|rex|ex|rcap|cap|ric|ic|rch|ch)\b/i;
const NUMBER = /^-?\d*\.?\d+$/;
const VAR_OF = /^var\(\s*(--[\w-]+)\s*\)$/i;
const CALC_TIMES = /^calc\(\s*var\(\s*(--[\w-]+)\s*\)\s*\*\s*(-?\d*\.?\d+)\s*\)$/i;
const CALC_TIMES_REVERSED = /^calc\(\s*(-?\d*\.?\d+)\s*\*\s*var\(\s*(--[\w-]+)\s*\)\s*\)$/i;
const CALC_DIVIDED = /^calc\(\s*var\(\s*(--[\w-]+)\s*\)\s*\/\s*(-?\d*\.?\d+)\s*\)$/i;
const MIN_STEPS = 2;

function stripComments(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every custom property declaration in a stylesheet's text, as [name, value, file]. */
function customPropertiesInText(text, file = null) {
  const declarations = [];
  const pattern = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  const source = stripComments(text);
  let match;
  while ((match = pattern.exec(source)) !== null) {
    declarations.push([match[1], match[2].trim(), file]);
  }
  return declarations;
}

/** The base and multiplier a token value states, or null: `var(--u)` is 1, `calc(var(--u) * 2)` is 2. */
function multipleOf(value) {
  const text = String(value).trim();
  let match = text.match(VAR_OF);
  if (match) return { multiplier: 1, unit: match[1] };
  match = text.match(CALC_TIMES);
  if (match) return { multiplier: Number(match[2]), unit: match[1] };
  match = text.match(CALC_TIMES_REVERSED);
  if (match) return { multiplier: Number(match[1]), unit: match[2] };
  match = text.match(CALC_DIVIDED);
  if (match && Number(match[2]) !== 0) return { multiplier: 1 / Number(match[2]), unit: match[1] };
  return null;
}

/** Whether a custom property value is a length with no fixed px value (it follows the font or the line). */
function isUnfixedLength(value) {
  return FONT_RELATIVE_LENGTH.test(` ${String(value).trim()}`);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * The unit ladder the declarations state, or null: the custom property with
 * an unfixed length that the most other custom properties are multiples of,
 * with at least two distinct multipliers. `declarations` is [name, value, file].
 */
function detectUnitLadder(declarations) {
  const bases = new Map();
  for (const [name, value, file] of declarations) {
    if (isUnfixedLength(value) && !multipleOf(value)) {
      if (!bases.has(name)) bases.set(name, { files: new Set(), value });
      if (file) bases.get(name).files.add(file);
    }
  }
  if (bases.size === 0) {
    return null;
  }
  const multiples = new Map();
  for (const [name, value, file] of declarations) {
    const multiple = multipleOf(value);
    if (!multiple || !bases.has(multiple.unit) || !Number.isFinite(multiple.multiplier) || multiple.multiplier <= 0) {
      continue;
    }
    if (!multiples.has(multiple.unit)) multiples.set(multiple.unit, { files: new Set(), steps: new Map() });
    const entry = multiples.get(multiple.unit);
    entry.steps.set(round(multiple.multiplier), name);
    if (file) entry.files.add(file);
  }
  let best = null;
  for (const [unit, entry] of multiples) {
    if (entry.steps.size < MIN_STEPS) continue;
    if (!best || entry.steps.size > best.entry.steps.size) best = { entry, unit };
  }
  if (!best) {
    return null;
  }
  const base = bases.get(best.unit);
  return {
    files: [...new Set([...base.files, ...best.entry.files])].sort(),
    multipliers: [...best.entry.steps.keys()].sort((a, b) => a - b),
    tokens: Object.fromEntries([...best.entry.steps].sort((a, b) => a[0] - b[0]).map(([step, token]) => [String(step), token])),
    unit: best.unit,
    value: base.value,
  };
}

/**
 * The multiplier a postcss-value-parser `calc()` node applies to `unit`, with
 * the number node that holds it, or null: `calc(var(--gap) * 1.3)`,
 * `calc(1.3 * var(--gap))`. Division is read as its multiplier and not fixed.
 */
function multiplierInCalc(node, unit) {
  if (!node || node.type !== 'function' || node.value.toLowerCase() !== 'calc') {
    return null;
  }
  const parts = (node.nodes || []).filter((part) => part.type !== 'space');
  if (parts.length !== 3) {
    return null;
  }
  const isUnit = (part) => part.type === 'function' && part.value.toLowerCase() === 'var'
    && part.nodes && part.nodes[0] && part.nodes[0].value === unit;
  const isNumber = (part) => part.type === 'word' && NUMBER.test(part.value);
  const [left, operator, right] = parts;
  const op = operator.value;
  if (isUnit(left) && op === '*' && isNumber(right)) {
    return { fixable: true, label: right.value, multiplier: Number(right.value), numberNode: right };
  }
  if (isNumber(left) && op === '*' && isUnit(right)) {
    return { fixable: true, label: left.value, multiplier: Number(left.value), numberNode: left };
  }
  if (isUnit(left) && op === '/' && isNumber(right) && Number(right.value) !== 0) {
    return { fixable: false, label: `1/${right.value}`, multiplier: 1 / Number(right.value), numberNode: right };
  }
  return null;
}

/** Whether a multiplier is a step of the ladder (zero always is). */
function onLadder(multiplier, multipliers) {
  return multiplier === 0 || multipliers.some((step) => Math.abs(step - Math.abs(multiplier)) < 1e-4);
}

function formatMultiplier(value) {
  return String(round(value));
}

module.exports = {
  customPropertiesInText,
  detectUnitLadder,
  formatMultiplier,
  isUnfixedLength,
  multipleOf,
  multiplierInCalc,
  onLadder,
};
