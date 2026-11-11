'use strict';

/**
 * The two default scales every surface reads, defined once (dx-06, cs-01).
 *
 * DEFAULT_SCALE is the scale for stylesheets: what `use-scale` checks with no
 * `scale` option, what `configs/recommended` sets, what the audit uses without
 * `--scale`, and what `scale: "auto"` falls back to. It is the `rhythmic-4`
 * preset.
 *
 * The Tailwind ladder is the scale for class strings when none is configured:
 * the numeric spacing utilities of Tailwind's default theme, as multiples of
 * the spacing unit (`--spacing: 0.25rem` in v4, the same quarter rem in the v3
 * default theme). On a 16px root that is 0, 2, 4, 6, 8, ... 384px, so `p-[20px]`
 * is the standard `p-5`, not off-scale.
 */
const DEFAULT_SCALE = Object.freeze([0, 4, 8, 12, 16, 24, 32, 40, 48, 64]);

const TAILWIND_SPACING_MULTIPLIERS = Object.freeze([
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]);

// The spacing unit as a share of the root font size: 0.25rem.
const TAILWIND_SPACING_UNIT_REM = 0.25;

/** Tailwind's default spacing ladder in px for a spacing unit in px (4 on a 16px root). */
function tailwindSpacingLadder(spacingUnitPx = 16 * TAILWIND_SPACING_UNIT_REM) {
  return TAILWIND_SPACING_MULTIPLIERS.map((multiplier) => multiplier * spacingUnitPx);
}

const TAILWIND_DEFAULT_SCALE = Object.freeze(tailwindSpacingLadder());

const TAILWIND_SCALE_NAME = 'Tailwind default spacing';

module.exports = {
  DEFAULT_SCALE,
  TAILWIND_DEFAULT_SCALE,
  TAILWIND_SCALE_NAME,
  TAILWIND_SPACING_MULTIPLIERS,
  TAILWIND_SPACING_UNIT_REM,
  tailwindSpacingLadder,
};
