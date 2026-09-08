'use strict';

const { fixedLengthValue, numbersEqual, toPx } = require('./length');
const { parseTokenValueLength } = require('./token-sources');

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
      index.push({ px, raw: String(raw).trim(), token: definition.token, unit });
    }
  }
  return index;
}

function tokenForLength(index, px, unit) {
  const wanted = unit || 'px';
  const candidates = new Set();
  for (const entry of index) {
    if (entry.token.startsWith('--') && entry.unit === wanted && numbersEqual(entry.px, Math.abs(px))) {
      candidates.add(entry.token);
    }
  }
  if (candidates.size !== 1) {
    return null;
  }
  return `var(${[...candidates][0]})`;
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
function replacementFor(parsedLength, nearestPx, options) {
  if (options.fixWith === 'token' && options.tokenIndex) {
    const token = tokenForLength(options.tokenIndex, nearestPx, parsedLength.unit || 'px');
    if (token) {
      return parsedLength.number < 0 ? negateReplacement(token) : token;
    }
  }
  return fixedLengthValue(parsedLength, nearestPx, options);
}

module.exports = {
  negateReplacement,
  replacementFor,
  tokenForLength,
  tokenIndexFromDefinitions,
};
