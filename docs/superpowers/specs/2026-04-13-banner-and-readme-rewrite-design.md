# Design Spec: Banner Redesign and README Rewrite

Date: 2026-04-13
Phase: 1 — Relevance Reset
Status: Approved

## Goal

Reposition Rhythmguard as token governance for modern Tailwind/React teams. The banner and README are the front door — they must communicate the product's value in under 10 seconds.

## Part 1: Banner Redesign

### Canvas

- Dimensions: 1400 x 420px
- Format: SVG with embedded Geist Pixel font (base64 WOFF2)
- Background: `#0C1117` (GitHub dark mode compatible, replaces current `#000`)

### Font

- Family: Geist Pixel, Original (Line) variant
- Source: `node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Line.woff2` — note: verify this is the same font currently embedded in the banner SVG. If the SVG uses a different Geist Pixel build, extract and compare before swapping.

### Color System

- Single color: `#ffffff` (white) only
- Hierarchy via 4 opacity tiers:
  - 100%: title, tagline, rules, lint pass values
  - 50%: meta bar text
  - 35%: lint fail values, footer, ruler labels, dot separators
  - 15%: borders, divider lines, ruler structure

### Layout Zones

Three horizontal zones separated by 2px divider lines:

| Zone    | Y range   | Height | Content                              |
|---------|-----------|--------|--------------------------------------|
| Meta    | 16–80     | 64px   | "STYLELINT PLUGIN · TOKEN GOVERNANCE"|
| Content | 80–340    | 260px  | Title, tagline, rules, lint output   |
| Footer  | 340–404   | 64px   | "REAL-WORLD TOOLING · 2026 PETRI LAHDELMA" |

Border: 2px stroke at 16px inset from all edges.

### Ruler

- Position: left edge, x=16 to x=56 (40px wide)
- Vertical border-right: 2px at 15% opacity
- 5 tick marks, evenly spaced top to bottom: 0, 8, 16, 24, 32
- Tick width: 12px
- Tick labels: 12px font, 35% opacity, positioned left of tick lines (inside ruler column)
- Divider lines start at x=56 (after ruler)

### Typography

| Element   | Size  | Letter-spacing | Opacity | Position          |
|-----------|-------|----------------|---------|-------------------|
| Title     | 132px | 4px            | 100%    | left: 64px, flex-centered in content zone |
| Tagline   | 24px  | 1px            | 100%    | 12px left margin from title, 16px below title |
| Rules     | 20px  | 1px            | 100%    | 12px left margin from title, 16px below tagline |
| Meta      | 20px  | 2px            | 50%     | left: 76px, flex-centered in meta zone |
| Footer    | 20px  | 1px            | 35%     | left: 76px, flex-centered in footer zone |
| Lint vals | 24px  | 0.5px          | varies  | right: 48px, flex-centered in content zone |
| Ruler     | 12px  | —              | 35%     | inside ruler column |

### Content — Left Side

Vertically centered as a group in the 260px content zone:

1. **RHYTHMGUARD** — 132px title
2. **SCALE OR TOKEN. PERIOD.** — 24px tagline, 16px gap below title
3. **use-scale · prefer-token · no-offscale-transform** — 20px, 16px gap below tagline. Dot separators at 35% opacity.

Title left edge at 64px (optical alignment with smaller text at 76px).
Tagline and rules at 76px (12px margin-left from title position).

### Content — Right Side

Lint output simulation, vertically centered in the content zone, right-aligned at right: 48px.

5 lines at 24px:

| Line                   | Style                          |
|------------------------|--------------------------------|
| `margin: 16px  ✓`     | 100% opacity                   |
| `padding: 13px  ✗`    | 35% opacity + strikethrough    |
| `gap: var(--space-4)  ✓` | 100% opacity                |
| `margin: 7px  ✗`      | 35% opacity + strikethrough    |
| `inset: 32px  ✓`      | 100% opacity                   |

12px vertical gap between each line.

### Stroke Weights

Uniform 2px throughout:
- Outer border: 2px
- Horizontal dividers: 2px
- Ruler vertical border: 2px
- Ruler tick marks: 1px

### What Changes from Current Banner

| Aspect          | Current                          | New                                    |
|-----------------|----------------------------------|----------------------------------------|
| Background      | `#000`                           | `#0C1117`                              |
| Title size      | 86px                             | 132px                                  |
| Meta/footer     | 18px                             | 20px                                   |
| Rules box       | Separate bordered box, right side | Inline below tagline, left side        |
| Lint output     | None                             | Right side, pass/fail simulation       |
| Ruler           | None                             | Left edge scale visualization          |
| Colors          | White on black                   | White with opacity tiers on `#0C1117`  |
| Stroke weights  | Mixed (3px, 2px, 3px)            | Uniform 2px                            |
| Spacing grid    | Arbitrary                        | All on 4px grid                        |
| Vertical layout | Manual positioning               | Flex-centered in zones                 |
| Tagline         | "NO RANDOM 13PX. SCALE OR TOKEN. PERIOD." | "SCALE OR TOKEN. PERIOD." |
| Meta text       | "STYLELINT PLUGIN · SPACING GOVERNANCE · TOKEN-FIRST" | "STYLELINT PLUGIN · TOKEN GOVERNANCE" |

### Implementation Notes

The banner is an SVG file at `assets/rhythmguard-banner.svg`. The font is embedded as a base64 WOFF2 data URL inside a `<style>` block. The new SVG must:

- Preserve the base64 font embedding approach
- Use `<text>` elements for all text (not HTML foreignObject)
- Include proper `role="img"` and `aria-labelledby` accessibility attributes
- Use SVG `<line>` for dividers and tick marks
- Use SVG `<rect>` for borders
- The lint output checkmark (✓) and cross (✗) characters must render in Geist Pixel

Flexbox centering from the HTML mockup must be translated to calculated SVG y-coordinates. The HTML mockup at `.superpowers/brainstorm/55592-1776053660/content/banner-ruler-v2.html` is the reference.

## Part 2: README Rewrite

### Opening Section

Replace the current opening ("High-precision spacing governance for CSS and design systems") with token-governance-first positioning:

- Lead with: what Rhythmguard does for Tailwind and component teams
- Primary examples use Tailwind v4 + React/Next.js workflows
- Mention CSS declarations AND template class strings (ESLint companion)

### Quick Start Reorder

Current order: recommended → strict → tailwind → expanded → logical → migration

New order:
1. **Next.js + Tailwind** (new, most common modern stack)
2. **Tailwind** (existing)
3. **Recommended** (generic)
4. **Strict** (advanced)
5. **Expanded** / **Logical** / **Migration** (specialty)

### Install Section

Add a "Next.js + Tailwind Quick Start" block before the generic Stylelint setup:

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

```js
// eslint.config.js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';
// ... tailwind-class-use-scale setup
```

### Demo Section

Keep the 60s demo GIF but move it below the quick start (not before it). People want to install first, watch the demo second.

### Rule Matrix

Keep the existing rule matrix table and SVG. Consider updating the rules SVG to match the new banner style (same background, typography), but this is lower priority than the banner itself.

### Sections to Keep As-Is

- Rule Details (use-scale, prefer-token, no-offscale-transform) — comprehensive, well-written
- Built-in Scale Presets table
- Community Scale Registry
- Option Validation
- Autofix Philosophy
- Compatibility
- Development
- Performance Benchmarking
- Release Workflow

### Sections to Update

- **Tailwind CSS Integration**: move higher in the README, expand with v4 @theme mention (forward reference to Phase 2 feature)
- **Programmatic Presets**: keep but move after the detailed rule docs
- **Article**: update with new positioning article reference (Phase 1 deliverable)
- **Used by**: keep the call-to-action, consider adding a demo repo reference

### Tone

Professional but opinionated. "We built this because spacing drift is real and most teams ignore it." Not academic, not salesy. Show the tool in action through examples, not marketing language.

## Success Criteria

1. Banner renders correctly on GitHub dark mode at ~700-900px width
2. All text in the banner is legible at GitHub's rendered size
3. Banner spacing is on a strict 4px grid (dogfooding the tool's own philosophy)
4. README quick-start time under 5 minutes for a Next.js + Tailwind app
5. First code example a visitor sees is a modern Tailwind/React workflow
6. The three rules are immediately visible in both banner and README

## Out of Scope

- Rules SVG redesign (follow-up task)
- New configs or presets (Phase 2)
- Tailwind v4 @theme support implementation (Phase 2)
- ESLint clsx/cva/cn expansion (Phase 2)
- CLI tools: init, audit, doctor (Phase 3)
