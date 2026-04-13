# Tailwind v4 @theme Token Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable zero-config token governance for Tailwind v4 projects using `@theme` blocks.

**Architecture:** PostCSS `walkDecls` already traverses `@theme` at-rule children, so `tokenMapFromCssCustomProperties` works with `@theme` out of the box. The only changes are: update the tailwind config preset to enable this, add tests, and update docs.

**Tech Stack:** Node.js, Stylelint, PostCSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/configs/tailwind.js` | Modify | Enable `tokenMapFromCssCustomProperties` with spacing token pattern |
| `src/configs/tailwind.mjs` | Modify | Keep ESM wrapper in sync |
| `test/prefer-token-token-sources.test.js` | Modify | Add @theme extraction tests |
| `README.md` | Modify | Document @theme support in Tailwind section |
| `docs/TAILWIND.md` | Modify | Add Tailwind v4 @theme section |

---

### Task 1: Add tests for @theme token extraction

**Files:**
- Modify: `test/prefer-token-token-sources.test.js`

- [ ] **Step 1: Write test for @theme block token extraction with autofix**

Add to the end of `test/prefer-token-token-sources.test.js`:

```js
test('prefer-token builds token map from @theme block declarations', async () => {
  const result = await lintCss({
    code: '@theme { --spacing-4: 16px; --spacing-3: 12px; } .stack { padding: 16px; gap: 12px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromCssCustomProperties: true,
          tokenPattern: '^--spacing-',
        },
      ],
    },
  });

  assert.equal(
    result.code,
    '@theme { --spacing-4: 16px; --spacing-3: 12px; } .stack { padding: var(--spacing-4); gap: var(--spacing-3); }',
  );
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
node --test test/prefer-token-token-sources.test.js
```

Expected: PASS (the existing `mergeTokenMapFromCssCustomProperties` already walks `@theme` children via PostCSS `walkDecls`).

- [ ] **Step 3: Write test for mixed @theme and :root custom properties**

Add to `test/prefer-token-token-sources.test.js`:

```js
test('prefer-token builds token map from mixed @theme and :root declarations', async () => {
  const result = await lintCss({
    code: '@theme { --spacing-4: 16px; } :root { --spacing-2: 8px; } .stack { padding: 16px; margin: 8px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromCssCustomProperties: true,
          tokenPattern: '^--spacing-',
        },
      ],
    },
  });

  assert.equal(
    result.code,
    '@theme { --spacing-4: 16px; } :root { --spacing-2: 8px; } .stack { padding: var(--spacing-4); margin: var(--spacing-2); }',
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test test/prefer-token-token-sources.test.js
```

Expected: PASS.

- [ ] **Step 5: Write test for tokenPattern filtering non-spacing @theme variables**

Add to `test/prefer-token-token-sources.test.js`:

```js
test('prefer-token ignores non-spacing @theme variables based on tokenPattern', async () => {
  const result = await lintCss({
    code: '@theme { --spacing-4: 16px; --color-primary: #3b82f6; } .stack { padding: 16px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromCssCustomProperties: true,
          tokenPattern: '^--spacing-',
        },
      ],
    },
  });

  assert.equal(
    result.code,
    '@theme { --spacing-4: 16px; --color-primary: #3b82f6; } .stack { padding: var(--spacing-4); }',
  );
});
```

- [ ] **Step 6: Run test to verify it passes**

```bash
node --test test/prefer-token-token-sources.test.js
```

Expected: PASS.

- [ ] **Step 7: Write test for explicit tokenMap taking precedence over @theme**

Add to `test/prefer-token-token-sources.test.js`:

```js
test('explicit tokenMap takes precedence over @theme-derived tokens', async () => {
  const result = await lintCss({
    code: '@theme { --spacing-4: 16px; } .stack { padding: 16px; }',
    fix: true,
    rules: {
      'rhythmguard/prefer-token': [
        true,
        {
          tokenMapFromCssCustomProperties: true,
          tokenPattern: '^--spacing-',
          tokenMap: {
            '16px': 'var(--custom-space-4)',
          },
        },
      ],
    },
  });

  assert.equal(
    result.code,
    '@theme { --spacing-4: 16px; } .stack { padding: var(--custom-space-4); }',
  );
});
```

- [ ] **Step 8: Run test to verify it passes**

```bash
node --test test/prefer-token-token-sources.test.js
```

Expected: PASS. The explicit `tokenMap` is merged first and takes precedence in `buildEffectiveTokenMap`.

- [ ] **Step 9: Run all tests to confirm no regressions**

```bash
node --test test/*.test.js
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add test/prefer-token-token-sources.test.js
git commit -m "test: add @theme block token extraction tests for prefer-token"
```

---

### Task 2: Update the tailwind config preset

**Files:**
- Modify: `src/configs/tailwind.js`
- Modify: `src/configs/tailwind.mjs`

- [ ] **Step 1: Update `src/configs/tailwind.js` to enable CSS custom property token extraction**

Replace the contents of `src/configs/tailwind.js` with:

```js
'use strict';

module.exports = {
  extends: [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--spacing',
        tokenMapFromCssCustomProperties: true,
      },
    ],
  },
};
```

This overrides the `prefer-token` rule from `strict` with Tailwind v4-compatible settings. The `tokenPattern: '^--spacing'` matches Tailwind v4's `--spacing-*` convention while still matching `--space-*` from older setups (both start with `--spac`). Wait — `--space-` does NOT start with `--spacing`. Let me use a pattern that matches both.

Actually, the strict config uses `tokenPattern: '^--space-'`. Tailwind v4 uses `--spacing-*`. These are different. The tailwind config should match `--spacing-*` specifically. Users who use `--space-*` custom properties can set their own pattern.

```js
'use strict';

module.exports = {
  extends: [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--spacing-',
        tokenMapFromCssCustomProperties: true,
      },
    ],
  },
};
```

- [ ] **Step 2: Update `src/configs/tailwind.mjs`**

Read the current file first, then update to match:

```js
export default {
  extends: [
    'stylelint-config-tailwindcss',
    'stylelint-plugin-rhythmguard/configs/strict',
  ],
  rules: {
    'rhythmguard/prefer-token': [
      true,
      {
        tokenPattern: '^--spacing-',
        tokenMapFromCssCustomProperties: true,
      },
    ],
  },
};
```

- [ ] **Step 3: Run all tests**

```bash
node --test test/*.test.js
```

Expected: All tests pass. The config change doesn't affect existing tests since they provide their own rule options.

- [ ] **Step 4: Commit**

```bash
git add src/configs/tailwind.js src/configs/tailwind.mjs
git commit -m "feat: enable @theme token extraction in tailwind config preset

Tailwind v4 defines spacing tokens as CSS custom properties in @theme blocks.
The tailwind config now enables tokenMapFromCssCustomProperties with
tokenPattern matching --spacing-* variables, giving Tailwind v4 projects
zero-config token governance."
```

---

### Task 3: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/TAILWIND.md`

- [ ] **Step 1: Add Tailwind v4 @theme section to `docs/TAILWIND.md`**

Add a new section after the "## Scope Model" section in `docs/TAILWIND.md`:

```markdown
## Tailwind v4 (@theme support)

Tailwind v4 defines spacing tokens as CSS custom properties inside `@theme` blocks:

```css
@theme {
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
}
```

The `tailwind` config preset automatically extracts these as token mappings. No extra config needed:

```json
{
  "extends": ["stylelint-plugin-rhythmguard/configs/tailwind"]
}
```

With this config, `padding: 16px` will be flagged and autofixed to `padding: var(--spacing-4)`.

### Tailwind v3 compatibility

Tailwind v3 projects using `tailwind.config.js` can continue using `tokenMapFromTailwindSpacing` with `tailwindConfigPath`. Both sources can coexist — explicit `tokenMap` and file-based maps always take precedence.
```

- [ ] **Step 2: Add @theme mention to README.md Tailwind section**

Find the "## Tailwind CSS Integration" section in `README.md`. Add a brief note about Tailwind v4 after the "### What Rhythmguard covers in Tailwind projects" subsection:

```markdown
### Tailwind v4 @theme tokens

The `tailwind` config preset automatically extracts spacing tokens from Tailwind v4 `@theme` blocks and uses them for `prefer-token` enforcement. Raw values like `padding: 16px` are autofixed to `padding: var(--spacing-4)`.

See [`docs/TAILWIND.md`](https://github.com/PetriLahdelma/stylelint-plugin-rhythmguard/blob/main/docs/TAILWIND.md) for full setup.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/TAILWIND.md
git commit -m "docs: document Tailwind v4 @theme token extraction"
```

---

### Task 4: Final verification

**Files:**
- All modified files

- [ ] **Step 1: Run all tests**

```bash
node --test test/*.test.js
```

Expected: All tests pass including the new @theme tests.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 3: Verify the tailwind config loads correctly**

```bash
node -e "const config = require('./src/configs/tailwind.js'); console.log(JSON.stringify(config, null, 2));"
```

Expected: Config shows `tokenMapFromCssCustomProperties: true` and `tokenPattern: '^--spacing-'` in the prefer-token rule.
