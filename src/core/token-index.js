'use strict';

const { propertyGroupOf } = require('./css-vocabulary');
const { fixedLengthValue, numbersEqual, toPx } = require('./length');
const { createTokenKindMatcher, parseTokenValueLength } = require('./token-sources');

// Dedicated kinds first: a name like --radius-space-1 is a radius token.
const TOKEN_KINDS = ['radius', 'typography', 'motion', 'size', 'spacing'].map((kind) => [kind, createTokenKindMatcher(kind)]);

// Which token kinds may stand in for a property of each group. Spacing and size
// share tokens in many systems (Open Props --size-*, mittwald --size-px--*);
// radius, type and motion tokens serve only their own properties.
const ACCEPTED_KINDS = Object.freeze({
  motion: ['motion'],
  radius: ['radius'],
  size: ['size', 'spacing'],
  spacing: ['spacing', 'size'],
  typography: ['typography'],
});

/** The kind a token's name declares, or null when the name says nothing. */
function tokenKindOf(token) {
  const found = TOKEN_KINDS.find(([, matches]) => matches(token));
  return found ? found[0] : null;
}

/**
 * Whether a token may be offered for a property: a padding never gets a radius
 * token, even when both hold 16px and the token pattern admits both. A token
 * whose name declares no kind, or a property outside every group, is allowed.
 */
function tokenFitsProperty(token, prop) {
  const group = prop ? propertyGroupOf(prop) : null;
  const kind = group ? tokenKindOf(String(token).replace(/^var\(\s*|\s*\)$/g, '')) : null;
  return !group || !kind || ACCEPTED_KINDS[group].includes(kind);
}

/**
 * Which token a fix may write for a length. Strict on purpose: the token must
 * hold the same px value in the same unit as the literal being fixed, it must
 * be a custom property (a Sass variable is not valid in CSS output), and it
 * must be the only candidate. A fix that guesses a token is worse than a fix
 * that writes a number, so anything ambiguous falls back to the literal.
 */
function tokenIndexFromDefinitions(definitions, baseFontSize = 16) {
  const index = [];
  for (const definition of definitions.values()) {
    for (const raw of definition.values) {
      const parsed = parseTokenValueLength(String(raw).trim());
      if (!parsed) continue;
      const unit = parsed.unit || 'px';
      const px = toPx(Math.abs(parsed.number), unit, baseFontSize);
      if (px === null || !Number.isFinite(px) || px === 0) continue;
      const file = definition.files ? [...definition.files][0] : null;
      index.push({ file: file && file !== 'stylesheet' ? file : null, px, raw: String(raw).trim(), token: definition.token, unit });
    }
  }
  return index;
}

/**
 * Every custom property that holds a length, for one property. The shared
 * resolver behind use-scale's `fixWith: "token"` and prefer-token, so the two
 * rules always know the same tokens. Same unit first; with `anyUnit`, a token
 * in another unit that holds the same px value counts when none matches the
 * unit. Sorted, so messages are stable.
 */
function tokensForLength(index, px, unit, { anyUnit = false, prop = null } = {}) {
  const wanted = unit || 'px';
  const sameUnit = new Set();
  const otherUnit = new Set();
  for (const entry of index) {
    if (!entry.token.startsWith('--') || !numbersEqual(entry.px, Math.abs(px)) || !tokenFitsProperty(entry.token, prop)) {
      continue;
    }
    (entry.unit === wanted ? sameUnit : otherUnit).add(entry.token);
  }
  const found = sameUnit.size > 0 || !anyUnit ? sameUnit : otherUnit;
  return [...found].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function tokenForLength(index, px, unit, prop = null) {
  const candidates = tokensForLength(index, px, unit, { prop });
  return candidates.length === 1 ? `var(${candidates[0]})` : null;
}

/** A negative token reference that is still valid where it is written. */
function negateReplacement(replacement) {
  if (!replacement || replacement.startsWith('-')) {
    return replacement;
  }
  if (replacement.startsWith('$') || replacement.startsWith('@')) {
    return `-${replacement}`;
  }
  return `calc(-1 * ${replacement})`;
}

/**
 * The replacement text a length rule writes: the matching token when the
 * options ask for one and exactly one qualifies, otherwise the literal.
 */
function replacementFor(parsedLength, nearestPx, options, prop = null) {
  if (options.fixWith === 'token' && options.tokenIndex) {
    const token = tokenForLength(options.tokenIndex, nearestPx, parsedLength.unit || 'px', prop);
    if (token) {
      return parsedLength.number < 0 ? negateReplacement(token) : token;
    }
  }
  return fixedLengthValue(parsedLength, nearestPx, options);
}

/**
 * The sentence a length rule appends when its fix writes a token: which token
 * holds the snapped value. Empty when the replacement is a literal.
 */
function tokenHoldsNote(replacement, formattedNearest) {
  const match = typeof replacement === 'string' ? replacement.match(/var\(--[^)]+\)/) : null;
  return match ? `${match[0]} holds ${formattedNearest}.` : '';
}

module.exports = {
  negateReplacement,
  replacementFor,
  tokenFitsProperty,
  tokenHoldsNote,
  tokenForLength,
  tokenIndexFromDefinitions,
  tokenKindOf,
  tokensForLength,
};
