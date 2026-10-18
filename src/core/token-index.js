'use strict';

const { propertyKindOf } = require('./css-vocabulary');
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
  const group = prop ? propertyKindOf(prop) : null;
  const kind = group ? tokenKindOf(String(token).replace(/^var\(\s*|\s*\)$/g, '')) : null;
  return !group || !kind || ACCEPTED_KINDS[group].includes(kind);
}

/**
 * The lengths one definition holds, each with its signed px value, or null
 * when the token holds more than one value. A token redefined under a media
 * query, a theme or a data attribute (`--space-3: 12px` at the root and 20px
 * from 768px up) renders differently there, so no single length stands for it
 * (issue #231). A value that is not a plain length counts as another value.
 */
function singleValuedLengths(definition, baseFontSize) {
  const lengths = [];
  for (const raw of definition.values) {
    const parsed = parseTokenValueLength(String(raw).trim());
    if (!parsed) return definition.values.size > 1 ? null : [];
    const unit = parsed.unit || 'px';
    const px = toPx(parsed.number, unit, baseFontSize);
    if (px === null || !Number.isFinite(px)) return definition.values.size > 1 ? null : [];
    lengths.push({ px, raw: String(raw).trim(), unit });
  }
  return lengths.every((length) => numbersEqual(length.px, lengths[0].px)) ? lengths : null;
}

/**
 * Which token a fix may write for a length. Strict on purpose: the token must
 * hold the same px value, with the same sign, in the same unit as the literal
 * being fixed, it must hold that one value everywhere, it must be a custom
 * property (a Sass variable is not valid in CSS output), and it must be the
 * only candidate. A fix that guesses a token is worse than a fix that writes
 * a number, so anything ambiguous falls back to the literal.
 */
function tokenIndexFromDefinitions(definitions, baseFontSize = 16) {
  const index = [];
  for (const definition of definitions.values()) {
    const lengths = singleValuedLengths(definition, baseFontSize);
    for (const { px, raw, unit } of lengths || []) {
      if (px === 0) continue;
      const file = definition.files ? [...definition.files][0] : null;
      index.push({ file: file && file !== 'stylesheet' ? file : null, px, raw, token: definition.token, unit });
    }
  }
  return index;
}

/**
 * Every custom property that holds a length, for one property. The shared
 * resolver behind use-scale's `fixWith: "token"` and prefer-token, so the two
 * rules always know the same tokens. The px value is signed: 8 finds the
 * tokens that hold 8px, -8 the tokens that hold -8px. Same unit first; with
 * `anyUnit`, a token in another unit that holds the same px value counts when
 * none matches the unit. Sorted, so messages are stable.
 */
function tokensForLength(index, px, unit, { anyUnit = false, prop = null } = {}) {
  const wanted = unit || 'px';
  const sameUnit = new Set();
  const otherUnit = new Set();
  for (const entry of index) {
    if (!entry.token.startsWith('--') || !numbersEqual(entry.px, px) || !tokenFitsProperty(entry.token, prop)) {
      continue;
    }
    (entry.unit === wanted ? sameUnit : otherUnit).add(entry.token);
  }
  const found = sameUnit.size > 0 || !anyUnit ? sameUnit : otherUnit;
  return [...found].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * The tokens for a signed length, and whether a fix negates them. A negative
 * value takes the tokens that hold it, written as they are, and otherwise the
 * tokens that hold its magnitude, negated. A positive value never gets a
 * negative token (issue #221).
 */
function signedTokensForLength(index, px, unit, options = {}) {
  if (px < 0) {
    const negative = tokensForLength(index, px, unit, options);
    if (negative.length > 0) {
      return { negate: false, tokens: negative };
    }
  }
  return { negate: px < 0, tokens: tokensForLength(index, Math.abs(px), unit, options) };
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
 * options ask for one and exactly one qualifies, otherwise the literal. The
 * nearest value is in px, or in the literal's unit with `unitStrategy:
 * "exact"`; tokens are indexed in px, so the lookup converts it (issue #223).
 * `avoidTokens` are the var() names a fallback literal falls back from; one
 * of them is never written, the literal is.
 */
function replacementFor(parsedLength, nearest, options, prop = null, avoidTokens = []) {
  if (options.fixWith === 'token' && options.tokenIndex) {
    const unit = parsedLength.unit || 'px';
    const nearestPx = options.unitStrategy === 'exact' ? toPx(Math.abs(nearest), unit, options.baseFontSize) : Math.abs(nearest);
    if (nearestPx !== null) {
      const signedPx = parsedLength.number < 0 ? -nearestPx : nearestPx;
      const { negate, tokens } = signedTokensForLength(options.tokenIndex, signedPx, unit, { prop });
      // A var() fallback never falls back to the token it is the fallback of (issue #240).
      if (tokens.length === 1 && !avoidTokens.includes(tokens[0])) {
        const token = `var(${tokens[0]})`;
        return negate ? negateReplacement(token) : token;
      }
    }
  }
  return fixedLengthValue(parsedLength, nearest, options);
}

/**
 * The sentence a length rule appends when its fix writes a token: which token
 * holds the snapped value. Empty when the replacement is a literal. A token
 * written as is for a negative literal holds the negative value.
 */
function tokenHoldsNote(replacement, formattedNearest, negativeLiteral = false) {
  const match = typeof replacement === 'string' ? replacement.match(/var\(--[^)]+\)/) : null;
  if (!match) {
    return '';
  }
  const holdsNegative = negativeLiteral && replacement === match[0];
  return `${match[0]} holds ${holdsNegative ? `-${formattedNearest}` : formattedNearest}.`;
}

module.exports = {
  negateReplacement,
  replacementFor,
  signedTokensForLength,
  tokenFitsProperty,
  tokenHoldsNote,
  tokenForLength,
  tokenIndexFromDefinitions,
  tokenKindOf,
  tokensForLength,
};
