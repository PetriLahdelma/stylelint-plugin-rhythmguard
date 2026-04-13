# Banner Redesign & README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the banner SVG and rewrite the README to reposition Rhythmguard for modern Tailwind/React teams.

**Architecture:** Two independent deliverables — a new SVG banner file and a restructured README.md. The banner is built as a handcrafted SVG with an embedded base64 Geist Pixel font. The README is reorganized to lead with Tailwind/Next.js workflows.

**Tech Stack:** SVG, Geist Pixel font (WOFF2), Markdown

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `assets/rhythmguard-banner.svg` | Replace | New banner SVG per design spec |
| `README.md` | Modify | Restructure for Tailwind-first positioning |
| `.superpowers/brainstorm/55592-1776053660/content/banner-ruler-v2.html` | Reference only | Approved HTML mockup for banner layout |
| `docs/superpowers/specs/2026-04-13-banner-and-readme-rewrite-design.md` | Reference only | Full design spec |

---

### Task 1: Extract and verify the Geist Pixel font data

**Files:**
- Reference: `assets/rhythmguard-banner.svg`
- Reference: `node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Line.woff2`

- [ ] **Step 1: Extract the base64 font string from the current SVG**

```bash
sed -n "s/.*src: url(\"\(data:font\/woff2;base64,[^\"]*\)\").*/\1/p" assets/rhythmguard-banner.svg > /tmp/current-font-dataurl.txt
wc -c /tmp/current-font-dataurl.txt
```

Expected: A file around ~24KB containing the data URL.

- [ ] **Step 2: Generate a base64 data URL from the npm package font file**

```bash
echo -n "data:font/woff2;base64," > /tmp/npm-font-dataurl.txt
base64 -i node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Line.woff2 >> /tmp/npm-font-dataurl.txt
wc -c /tmp/npm-font-dataurl.txt
```

- [ ] **Step 3: Compare the two font files**

```bash
diff /tmp/current-font-dataurl.txt /tmp/npm-font-dataurl.txt
```

If they differ, the current SVG uses a different Geist Pixel build. In that case, keep the existing font data from the SVG — it's proven to render correctly. Store the font data URL in a variable for Task 2:

```bash
FONT_DATA=$(cat /tmp/current-font-dataurl.txt)
```

- [ ] **Step 4: Commit (no changes — this is verification only)**

No commit needed. Proceed to Task 2.

---

### Task 2: Build the new banner SVG

**Files:**
- Replace: `assets/rhythmguard-banner.svg`

The SVG must be built by computing exact y-coordinates from the approved HTML mockup. The HTML uses flexbox centering — we need to translate that to fixed SVG positions.

- [ ] **Step 1: Calculate vertical positions for the content zone**

The content zone is 80–340 (260px). The text group to center:
- Title: 132px (line-height 1, so cap height ≈ 132px)
- Gap: 16px
- Tagline: 24px
- Gap: 16px
- Rules: 20px
- Total: 132 + 16 + 24 + 16 + 20 = 208px

Top offset: 80 + (260 - 208) / 2 = 80 + 26 = 106px

SVG `<text>` uses baseline positioning, so:
- Title baseline: 106 + 132 = 238 → but pixel fonts have different metrics. Use the HTML mockup as ground truth and adjust by eye if needed.
- Tagline baseline: 238 + 16 + 24 = 278
- Rules baseline: 278 + 16 + 20 = 314

Meta zone (16–80, 64px): centered text baseline ≈ 16 + 32 + 7 = 55 (adjust for font metrics)
Footer zone (340–404, 64px): centered text baseline ≈ 340 + 32 + 7 = 379

Lint output (right side, 5 lines of 24px with 12px gaps):
- Total height: 5 × 24 + 4 × 12 = 168px
- Top offset in content zone: 80 + (260 - 168) / 2 = 80 + 46 = 126
- Line baselines: 126+24=150, 150+12+24=186, 186+12+24=222, 222+12+24=258, 258+12+24=294

Ruler ticks (5 ticks evenly spaced in full height 16–404 = 388px):
- Interval: 388 / 4 = 97px
- Positions: 16+19=35, 35+97=132, 132+97=229, 229+97=326, 326+97=404-16=388 → y values: 35, 132, 229, 326, 404

- [ ] **Step 2: Write the new SVG file**

Read the current font data URL first:

```bash
FONT_DATA=$(sed -n "s/.*src: url(\"\(data:font\/woff2;base64,[^\"]*\)\").*/\1/p" assets/rhythmguard-banner.svg)
```

Then write the new SVG to `assets/rhythmguard-banner.svg`. The SVG structure:

```svg
<svg width="1400" height="420" viewBox="0 0 1400 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Rhythmguard — token governance for CSS and Tailwind</title>
  <desc id="desc">Banner showing spacing scale ruler and lint output in Geist Pixel font on dark background.</desc>
  <defs>
    <style>
      @font-face {
        font-family: 'GeistPixel';
        src: url("FONT_DATA_HERE") format('woff2');
        font-weight: 400;
        font-style: normal;
      }
      text { font-family: 'GeistPixel', monospace; fill: #fff; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="1400" height="420" fill="#0C1117" />

  <!-- Border (16px inset, 2px stroke, 15% opacity) -->
  <rect x="17" y="17" width="1366" height="386" rx="0" stroke="rgba(255,255,255,0.15)" stroke-width="2" fill="none" />

  <!-- Ruler column (left, x=16-56) -->
  <line x1="58" y1="16" x2="58" y2="404" stroke="rgba(255,255,255,0.15)" stroke-width="2" />

  <!-- Ruler ticks: 0, 8, 16, 24, 32 — evenly spaced -->
  <line x1="46" y1="35" x2="58" y2="35" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
  <text x="42" y="39" font-size="12" fill="rgba(255,255,255,0.35)" text-anchor="end">0</text>

  <line x1="46" y1="132" x2="58" y2="132" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
  <text x="42" y="136" font-size="12" fill="rgba(255,255,255,0.35)" text-anchor="end">8</text>

  <line x1="46" y1="229" x2="58" y2="229" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
  <text x="42" y="233" font-size="12" fill="rgba(255,255,255,0.35)" text-anchor="end">16</text>

  <line x1="46" y1="326" x2="58" y2="326" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
  <text x="42" y="330" font-size="12" fill="rgba(255,255,255,0.35)" text-anchor="end">24</text>

  <line x1="46" y1="404" x2="58" y2="404" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
  <text x="42" y="401" font-size="12" fill="rgba(255,255,255,0.35)" text-anchor="end">32</text>

  <!-- Horizontal dividers -->
  <line x1="58" y1="80" x2="1384" y2="80" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
  <line x1="58" y1="340" x2="1384" y2="340" stroke="rgba(255,255,255,0.15)" stroke-width="2" />

  <!-- Meta text (50% opacity, centered in 16-80 zone) -->
  <text x="76" y="55" font-size="20" letter-spacing="2" fill="rgba(255,255,255,0.5)">STYLELINT PLUGIN · TOKEN GOVERNANCE</text>

  <!-- Title (100%, centered in content zone) -->
  <text x="64" y="238" font-size="132" letter-spacing="4">RHYTHMGUARD</text>

  <!-- Tagline -->
  <text x="76" y="278" font-size="24" letter-spacing="1">SCALE OR TOKEN. PERIOD.</text>

  <!-- Rules -->
  <text x="76" y="314" font-size="20" letter-spacing="1">
    <tspan fill="#fff">use-scale</tspan>
    <tspan fill="rgba(255,255,255,0.35)"> · </tspan>
    <tspan fill="#fff">prefer-token</tspan>
    <tspan fill="rgba(255,255,255,0.35)"> · </tspan>
    <tspan fill="#fff">no-offscale-transform</tspan>
  </text>

  <!-- Lint output (right-aligned, centered in content zone) -->
  <text x="1352" y="150" font-size="24" letter-spacing="0.5" text-anchor="end">margin: 16px  ✓</text>
  <text x="1352" y="186" font-size="24" letter-spacing="0.5" text-anchor="end" fill="rgba(255,255,255,0.35)" text-decoration="line-through">padding: 13px  ✗</text>
  <text x="1352" y="222" font-size="24" letter-spacing="0.5" text-anchor="end">gap: var(--space-4)  ✓</text>
  <text x="1352" y="258" font-size="24" letter-spacing="0.5" text-anchor="end" fill="rgba(255,255,255,0.35)" text-decoration="line-through">margin: 7px  ✗</text>
  <text x="1352" y="294" font-size="24" letter-spacing="0.5" text-anchor="end">inset: 32px  ✓</text>

  <!-- Footer (35% opacity, centered in 340-404 zone) -->
  <text x="76" y="379" font-size="20" letter-spacing="1" fill="rgba(255,255,255,0.35)">REAL-WORLD TOOLING · 2026 PETRI LAHDELMA</text>
</svg>
```

Replace `FONT_DATA_HERE` with the actual font data URL from Step 1. Use a script to inject it:

```bash
FONT_DATA=$(sed -n "s/.*src: url(\"\(data:font\/woff2;base64,[^\"]*\)\").*/\1/p" assets/rhythmguard-banner.svg)
# Write the new SVG content to a temp file with a placeholder
# Then replace the placeholder with the font data
sed -i '' "s|FONT_DATA_HERE|${FONT_DATA}|" assets/rhythmguard-banner.svg
```

- [ ] **Step 3: Visually verify the SVG renders correctly**

Open `assets/rhythmguard-banner.svg` in a browser. Check:
1. Background is `#0C1117` (not black)
2. Title "RHYTHMGUARD" is large and dominant
3. Ruler ticks and labels are visible on the left
4. Lint output is right-aligned with pass/fail distinction
5. Meta and footer text is readable but dimmed
6. Strikethrough renders on fail lines
7. All text renders in Geist Pixel font

If `text-decoration="line-through"` doesn't work in SVG, use an alternative — draw `<line>` elements over the fail text:

```svg
<!-- Strikethrough for "padding: 13px  ✗" at y=186 -->
<line x1="1160" y1="180" x2="1352" y2="180" stroke="rgba(255,255,255,0.35)" stroke-width="2" />
```

- [ ] **Step 4: Adjust y-coordinates if needed**

The calculated positions are estimates. Geist Pixel's actual metrics may shift baselines. Compare the SVG render against the approved HTML mockup at `.superpowers/brainstorm/55592-1776053660/content/banner-ruler-v2.html` and adjust y values until they match visually.

- [ ] **Step 5: Commit**

```bash
git add assets/rhythmguard-banner.svg
git commit -m "feat(banner): redesign with scale ruler, lint output, and opacity hierarchy

- Background: #0C1117 (GitHub dark mode compatible)
- Title: 132px Geist Pixel
- Scale ruler with 0/8/16/24/32 ticks
- Lint pass/fail simulation on right side
- 4-tier white opacity hierarchy (100/50/35/15%)
- All spacing on 4px grid"
```

---

### Task 3: Restructure the README opening and quick start

**Files:**
- Modify: `README.md` (lines 1–66)

- [ ] **Step 1: Rewrite the opening section (lines 1–34)**

Replace the current content from line 1 through the "It is built for teams that want:" bullet list with:

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/petrilahdelma/stylelint-plugin-rhythmguard/main/assets/rhythmguard-banner.svg" width="100%" alt="Rhythmguard banner showing spacing scale ruler and lint output" />
</p>

# stylelint-plugin-rhythmguard

Token governance for CSS and Tailwind. Enforce spacing scales, require design tokens, and catch arbitrary values before they ship.

[![CI](https://img.shields.io/github/actions/workflow/status/petrilahdelma/stylelint-plugin-rhythmguard/ci.yml?branch=main&label=ci)](https://github.com/petrilahdelma/stylelint-plugin-rhythmguard/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![npm downloads](https://img.shields.io/npm/dm/stylelint-plugin-rhythmguard.svg)](https://www.npmjs.com/package/stylelint-plugin-rhythmguard)
[![License: MIT](https://img.shields.io/badge/license-MIT-white.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18-black.svg)](https://nodejs.org/)

Rhythmguard enforces scale and token discipline across spacing, radius, typography, size, and motion offsets — in CSS declarations and Tailwind class strings.

Built for teams that want:

- zero random spacing values in production
- token-first workflows with autofix migration
- Tailwind arbitrary value governance (`p-[13px]` → `p-[12px]`)
- consistent layout rhythm across components and pages
```

- [ ] **Step 2: Add a Next.js + Tailwind Quick Start section before the existing Quick Start**

Insert after the badges/intro, before the Rule Matrix section:

```markdown
## Quick Start: Next.js + Tailwind

```bash
npm install --save-dev stylelint stylelint-plugin-rhythmguard
```

**.stylelintrc.json:**

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

**eslint.config.js** (for Tailwind class-string governance):

```js
import rhythmguard from 'stylelint-plugin-rhythmguard/eslint';

export default [
  {
    plugins: { 'rhythmguard-tailwind': rhythmguard },
    rules: {
      'rhythmguard-tailwind/tailwind-class-use-scale': [
        'error',
        { scale: [0, 4, 8, 12, 16, 24, 32] }
      ],
    },
  },
];
```

This gives you spacing governance in both CSS files and JSX/TSX templates.
```

- [ ] **Step 3: Move the Demo section below the Quick Start**

Move the Demo section (lines 17–33 in the current README) to after the Quick Start sections, before the Rule Matrix. The new order becomes:

1. Banner + intro
2. Quick Start: Next.js + Tailwind (new)
3. Rule Matrix
4. Demo (moved)
5. Installation (existing)
6. Quick Start configs (existing, reordered)

- [ ] **Step 4: Reorder the Quick Start configs**

Change the config listing order to:

1. Tailwind config
2. Recommended config
3. Strict config
4. Expanded config
5. Logical config
6. Migration config

- [ ] **Step 5: Verify the README renders correctly**

```bash
# Check for broken markdown syntax
npx markdownlint README.md || echo "Install markdownlint if available"

# Visual check: open in a markdown previewer or push to a branch and check on GitHub
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: reposition README for Tailwind/React teams

- Lead with token governance positioning
- Add Next.js + Tailwind quick start as primary entry point
- Reorder configs: tailwind first
- Move demo below quick start
- Mention ESLint companion in intro"
```

---

### Task 4: Update the README description line in package.json

**Files:**
- Modify: `package.json` (line 3)

- [ ] **Step 1: Update the description field**

Change line 3 from:

```json
"description": "Stylelint plugin for spacing scale, token enforcement, and Tailwind class-string governance",
```

to:

```json
"description": "Token governance for CSS and Tailwind — enforce spacing scales, require design tokens, catch arbitrary values",
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "docs: update package description to match new positioning"
```

---

### Task 5: Final verification

**Files:**
- Reference: `assets/rhythmguard-banner.svg`
- Reference: `README.md`

- [ ] **Step 1: Run existing tests to ensure nothing is broken**

```bash
npm test
```

Expected: All tests pass. The banner and README changes are docs-only — no code changed.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No new lint errors.

- [ ] **Step 3: Verify the SVG file size is reasonable**

```bash
wc -c assets/rhythmguard-banner.svg
```

Expected: Similar to current size (~24-30KB, mostly font data).

- [ ] **Step 4: Check the README renders in a local preview**

Open `README.md` in VS Code preview or similar. Verify:
1. Banner image tag points to correct path
2. No broken markdown
3. Quick Start code blocks render correctly
4. Section order matches the spec

- [ ] **Step 5: Verify the banner SVG in browser**

Open `assets/rhythmguard-banner.svg` directly in a browser. Confirm it matches the approved mockup.
