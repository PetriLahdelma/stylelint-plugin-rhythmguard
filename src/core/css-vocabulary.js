'use strict';

const PROPERTY_GROUP_PATTERNS = Object.freeze({
  spacing: Object.freeze([
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
  ]),
  radius: Object.freeze([
    /^border-radius$/,
    /^border-(?:top|right|bottom|left)-(?:left|right)-radius$/,
    /^border-(?:start|end)-(?:start|end)-radius$/,
    /^outline-offset$/,
  ]),
  size: Object.freeze([
    /^inline-size$/,
    /^block-size$/,
    /^min-inline-size$/,
    /^min-block-size$/,
    /^max-inline-size$/,
    /^max-block-size$/,
    /^(?:min-|max-)?(?:width|height)$/,
  ]),
  typography: Object.freeze([
    /^font-size$/,
    /^line-height$/,
    /^letter-spacing$/,
    /^word-spacing$/,
  ]),
  motion: Object.freeze([
    /^transition(?:-.+)?$/,
    /^animation(?:-.+)?$/,
  ]),
});

/** The property group a CSS property belongs to, or null. */
function propertyGroupOf(prop) {
  const lower = String(prop || '').toLowerCase();
  const found = Object.entries(PROPERTY_GROUP_PATTERNS).find(([, patterns]) => patterns.some((pattern) => pattern.test(lower)));
  return found ? found[0] : null;
}

// Properties whose length is a different kind from the group that checks them.
// outline-offset is checked with the radius group (it always has been), but it
// is the gap between the border edge and the outline: a spacing length. A
// radius token there would tie every focus ring to the corner radius.
const PROPERTY_KIND_OVERRIDES = Object.freeze({
  'outline-offset': 'spacing',
});

/**
 * The kind of length a property takes, for choosing tokens and a group's
 * scale. The property group, except where PROPERTY_KIND_OVERRIDES says otherwise.
 */
function propertyKindOf(prop) {
  const lower = String(prop || '').toLowerCase();
  return PROPERTY_KIND_OVERRIDES[lower] || propertyGroupOf(lower);
}

const DEFAULT_PROPERTY_GROUPS = Object.freeze(['spacing']);
const PROPERTY_GROUP_NAMES = Object.freeze(Object.keys(PROPERTY_GROUP_PATTERNS));

const SPACING_PROPERTY_PATTERNS = PROPERTY_GROUP_PATTERNS.spacing;

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

const SUPPORTED_SCALE_UNITS = new Set([
  'px',
  'rem',
  'em',
  '%',
  'vh',
  'vw',
  'vi',
  'vb',
  'vmin',
  'vmax',
  'svh',
  'svw',
  'svi',
  'svb',
  'lvh',
  'lvw',
  'lvi',
  'lvb',
  'dvh',
  'dvw',
  'dvi',
  'dvb',
  'cqh',
  'cqw',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
  'ch',
  'ex',
]);

const DEFAULT_MATH_FUNCTION_ARGUMENT_FILTER = Object.freeze({});

module.exports = {
  propertyGroupOf,
  propertyKindOf,
  DEFAULT_IGNORE_KEYWORDS,
  DEFAULT_MATH_FUNCTION_ARGUMENT_FILTER,
  DEFAULT_PROPERTY_GROUPS,
  MATH_FUNCTIONS,
  PROPERTY_GROUP_NAMES,
  PROPERTY_GROUP_PATTERNS,
  SPACING_PROPERTY_PATTERNS,
  SUPPORTED_SCALE_UNITS,
  TRANSLATE_FUNCTIONS,
};
