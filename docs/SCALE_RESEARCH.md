# Scale Preset Research

Research date: February 16, 2026.

This document maps source research to preset decisions for Rhythmguard.

## Selection Criteria

A scale was added only if it met all three conditions:

1. It is used or documented in production design systems, editorial workflows, or design theory.
2. It can be represented as practical spacing increments for CSS layout/motion.
3. It has clear migration value for real product teams.

## Product Design Sources

- Material Design: layout uses an 8dp baseline grid and references 4dp increments for iconography and components.
  - Source: https://m1.material.io/layout/understanding-layout.html
- Material responsive layout: margins and gutters are explicit 4/8-based increments in multi-column layouts.
  - Source: https://m1.material.io/layout/responsive-ui.html
- Atlassian Design System spacing tokens define a practical progression used in product UI.
  - Source: https://atlassian.design/foundations/spacing/
- IBM Carbon 2x Grid and spacing documentation define tokenized spacing steps based on a 2x/8x model.
  - Source: https://carbondesignsystem.com/elements/2x-grid/overview/

Added presets:

- `product-material-8dp`
- `product-atlassian-8px`
- `product-carbon-2x`

## Editorial / Grid Sources

- Adobe InDesign typography guidance: leading and baseline rhythm are foundational for editorial layout cadence.
  - Source: https://helpx.adobe.com/ie/indesign/using/leading.html
- Material responsive layout docs (column + gutter + margin logic) as a transferable reference for modern grid-based editorial/product content layouts.
  - Source: https://m1.material.io/layout/responsive-ui.html

Added presets:

- `editorial-baseline-4`
- `editorial-baseline-6`

## Art/Design Theory Sources

- Modular scale theory and ratio families (major second, minor third, perfect fourth, etc.).
  - Source: https://24ways.org/2011/composing-the-new-canon/
- Typographic modular scale use with the golden ratio.
  - Source: https://alistapart.com/article/more-meaningful-typography/

Added presets:

- `modular-major-second`
- `modular-minor-third`
- `modular-major-third`
- `modular-augmented-fourth`
- `modular-perfect-fourth`
- `modular-perfect-fifth`
- `golden-ratio`
- `fibonacci`

## Scales Not Added

Some historically important systems were intentionally not added as first-class presets:

- architecture-scale systems (for example, raw Modulor dimensions) because they map poorly to common UI spacing token ranges without arbitrary normalization
- page-construction canons that define region ratios rather than reusable spacing increments

If needed, teams can still model these using `customScale`.
