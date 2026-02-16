'use strict';

const SPACING_PROPERTY_PATTERNS = [
  /^margin(?:-.+)?$/,
  /^padding(?:-.+)?$/,
  /^gap$/,
  /^row-gap$/,
  /^column-gap$/,
  /^inset(?:-.+)?$/,
  /^scroll-margin(?:-.+)?$/,
  /^scroll-padding(?:-.+)?$/,
  /^translate$/,
  /^translate-[xyz]$/,
  /^transform$/,
];

const DEFAULT_IGNORE_KEYWORDS = [
  'auto',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
];

const TRANSLATE_FUNCTIONS = new Set([
  'translate',
  'translatex',
  'translatey',
  'translatez',
  'translate3d',
]);

const MATH_FUNCTIONS = new Set(['calc', 'clamp', 'min', 'max']);

module.exports = {
  DEFAULT_IGNORE_KEYWORDS,
  MATH_FUNCTIONS,
  SPACING_PROPERTY_PATTERNS,
  TRANSLATE_FUNCTIONS,
};
