'use strict';

/**
 * Which tokens of a token source make the spacing scale (tf-01, tf-08, tf-11).
 * Names come first, as in 3.19: a file whose names give a spacing length
 * keeps exactly the tokens it gave. Only a file whose names give none is read
 * again, with names in any case and camelCase, and in JSON by a dimension
 * type whatever the name. Tokens Studio sets, unitless px and math, DTCG
 * `$root` and `$deprecated` are read in either pass.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseTokenSources } = require('../../src/core/token-sources');
const { scaleFromDefinitions } = require('../../src/core/scale-inference');
const { lintCss } = require('../helpers/lint');

const fixtures = path.join(__dirname, '..', 'fixtures', 'token-selection');
const EXIT_SCALE = [0, 4, 8, 12, 16, 24, 32];

function writeSource(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-token-selection-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return file;
}

function read(file, extra = {}) {
  const parsed = parseTokenSources({ sources: [{ path: file, ...extra }], warnWhenEmpty: true });
  const values = Object.fromEntries([...parsed.definitions].map(([token, definition]) => [token, [...definition.values].join(' | ')]));
  return { ...parsed, scale: scaleFromDefinitions(parsed.definitions), source: parsed.sources[0], values };
}

function readInline(name, content, extra) {
  return read(writeSource(name, content), extra);
}

// In 3.x the deprecated 2px and 20px of dtcg-root.json stay on the scale (tf-11); they leave it in 4.0.
const ROOT_SCALE_3X = [0, 2, 4, 8, 12, 16, 20, 24, 32];

test('role-named DTCG, camelCase and Tokens Studio fixtures infer [0, 4, 8, 12, 16, 24, 32]; $root reads its group (tf-01, tf-08, tf-11)', () => {
  const expected = {
    'camel-case.css': { format: 'css', scale: EXIT_SCALE, selectedBy: 'name' },
    'dtcg-roles.json': { format: 'dtcg', scale: EXIT_SCALE, selectedBy: 'type' },
    'dtcg-root.json': { format: 'dtcg', scale: ROOT_SCALE_3X, selectedBy: 'name' },
    'tokens-studio.json': { format: 'tokens-studio', scale: EXIT_SCALE, selectedBy: 'name' },
  };
  for (const [file, { format, scale, selectedBy }] of Object.entries(expected)) {
    const parsed = read(path.join(fixtures, file));
    assert.deepEqual(parsed.scale, scale, file);
    assert.equal(parsed.source.format, format, file);
    assert.equal(parsed.source.selectedBy, selectedBy, file);
    assert.deepEqual(parsed.warnings, [], file);
  }
});

test('a DTCG token typed as a dimension is read whatever its name, but not one named for another kind (tf-01)', () => {
  const parsed = read(path.join(fixtures, 'dtcg-roles.json'));
  assert.deepEqual(parsed.values, {
    '--layout-gap-md': '12px',
    '--layout-gap-sm': '8px',
    '--layout-gap-xs': '4px',
    '--layout-inset-lg': '24px',
    '--layout-inset-md': '16px',
    '--layout-inset-sm': '8px',
    '--layout-stack-xl': '2rem',
  });

  // `dimension.100` style names and a token's own `$type` count; a group's `$type` is inherited.
  const numbered = readInline('tokens.json', {
    dimension: {
      $type: 'dimension',
      100: { $value: { value: 4, unit: 'px' } },
      200: { $value: { value: 8, unit: 'px' } },
      300: { $value: { value: 16, unit: 'px' } },
    },
    gutter: { $type: 'dimension', $value: { value: 24, unit: 'px' } },
    breakpoint: { $type: 'dimension', md: { $value: { value: 768, unit: 'px' } } },
    lineHeight: { $type: 'dimension', body: { $value: { value: 24, unit: 'px' } } },
  });
  assert.deepEqual(Object.keys(numbered.values).sort(), ['--dimension-100', '--dimension-200', '--dimension-300', '--gutter']);
  assert.deepEqual(numbered.scale, [0, 4, 8, 16, 24]);
  assert.equal(numbered.source.selectedBy, 'type');

  // Style Dictionary and Tokens Studio name the type `type`: spacing, sizing and dimension count.
  const legacy = readInline('tokens.json', {
    gap: { sm: { value: '4px', type: 'spacing' }, md: { value: '8px', type: 'dimension' }, lg: { value: '16px', type: 'sizing' } },
    opacity: { half: { value: '0.5', type: 'opacity' } },
  });
  assert.deepEqual(legacy.scale, [0, 4, 8, 16]);
  assert.equal(legacy.source.selectedBy, 'type');
});

test('a file whose names already give a scale keeps exactly that scale; type selection never widens it (3.x compatibility)', () => {
  // Size tokens typed as dimensions next to a named spacing group: the spacing group alone, as in 3.19.
  const mixed = readInline('tokens.json', {
    space: { $type: 'dimension', 1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '16px' } },
    size: { $type: 'dimension', icon: { $value: '20px' }, avatar: { $value: '40px' } },
    layout: { $type: 'dimension', gutter: { $value: '6px' } },
  });
  assert.deepEqual(mixed.scale, [0, 4, 8, 16]);
  assert.deepEqual(Object.keys(mixed.values), ['--space-1', '--space-2', '--space-3']);
  assert.equal(mixed.source.selectedBy, 'name');

  // A CSS file named by the 3.19 rule keeps its tokens; a camelCase stray is not added.
  const css = readInline('tokens.css', ':root { --space-1: 4px; --space-2: 8px; --space-3: 16px; --spacingHalf: 2px; --Space-Odd: 7px; }');
  assert.deepEqual(css.scale, [0, 4, 8, 16]);
  assert.equal(css.source.selectedBy, 'name');

  // A tokenPattern is the whole rule for its source: no second reading.
  const pattern = readInline('tokens.json', { layout: { $type: 'dimension', gap: { $value: '4px' } } }, { tokenPattern: '^--size-' });
  assert.equal(pattern.definitions.size, 0);
  assert.equal(pattern.source.selectedBy, 'tokenPattern');
  assert.match(pattern.warnings[0], /yielded no tokens matching tokenPattern "\^--size-"/);
});

test('spacing names are read in any case and with a camelCase or digit boundary when no 3.19 name matches (tf-01)', () => {
  const cased = readInline('tokens.css', ':root { --Space-1: 4px; --SPACE-2: 8px; --spacingMd: 12px; --spacing4: 16px; }');
  assert.deepEqual(cased.scale, [0, 4, 8, 12, 16]);
  assert.equal(cased.source.selectedBy, 'name');

  // Style Dictionary json/flat: PascalCase keys.
  const flat = readInline('tokens.json', { Space1: '4px', Space2: '8px', Space3: '16px', BorderRadius1: '2px' });
  assert.deepEqual(Object.keys(flat.values), ['--Space1', '--Space2', '--Space3']);

  // Never letter- or word-spacing, and the word must end at a boundary.
  const notSpacing = readInline('tokens.css', ':root { --letterSpacingTight: 1px; --Letter-Spacing-1: 2px; --WORD-SPACING-2: 3px; --spaceship: 4px; --spacious: 5px; }');
  assert.deepEqual(notSpacing.values, {});
  assert.match(notSpacing.warnings[0], /yielded no spacing tokens; spacing tokens are read by name \(space, spacing or spacer, in any case\) or, in JSON, by a dimension type/);
});

test('Tokens Studio: sets read without their names, unitless px, math over references, and type selection (tf-08)', () => {
  const parsed = read(path.join(fixtures, 'tokens-studio.json'));
  assert.deepEqual(parsed.values, {
    '--spacing-2xl': '32px',
    '--spacing-lg': '16px',
    '--spacing-md': '12px',
    '--spacing-sm': '8px',
    '--spacing-xl': '24px',
    '--spacing-xs': '4px',
  });

  // Role names only: read by `type`, with references resolved across sets in tokenSetOrder.
  const roles = readInline('tokens.json', {
    primitives: { base: { value: '4', type: 'dimension' }, ratio: { value: '2', type: 'number' } },
    layout: {
      gap: {
        xs: { value: '{base}', type: 'spacing' },
        sm: { value: '{base} * {ratio}', type: 'spacing' },
        md: { value: '{base} * 3', type: 'spacing' },
        lg: { value: '({base} + 4px) * 2', type: 'spacing' },
        rem: { value: '0.5rem * 4', type: 'spacing' },
      },
      radius: { sm: { value: '2', type: 'borderRadius' } },
    },
    $metadata: { tokenSetOrder: ['primitives', 'layout'] },
  });
  assert.deepEqual(roles.values, {
    '--base': '4px',
    '--gap-lg': '16px',
    '--gap-md': '12px',
    '--gap-rem': '2rem',
    '--gap-sm': '8px',
    '--gap-xs': '4px',
  });
  assert.equal(roles.source.selectedBy, 'type');
  assert.equal(roles.source.format, 'tokens-studio');

  // W3C mode: `$value` and `$type: "spacing"`. A later set overrides an earlier one for references.
  // Every set is read, so both units are steps, as when each set was read under its own name.
  const w3c = readInline('tokens.json', {
    base: { space: { unit: { $value: '2', $type: 'spacing' } } },
    brand: {
      space: { unit: { $value: '4', $type: 'spacing' } },
      spacing: { sm: { $value: '{space.unit} * 2', $type: 'spacing' }, lg: { $value: '{space.unit} * 4', $type: 'spacing' }, xl: { $value: '{space.unit} * 6', $type: 'spacing' } },
    },
    $themes: [],
    $metadata: { tokenSetOrder: ['base', 'brand'] },
  });
  assert.deepEqual(w3c.values, { '--space-unit': '2px | 4px', '--spacing-lg': '16px', '--spacing-sm': '8px', '--spacing-xl': '24px' });
  assert.deepEqual(w3c.scale, [0, 2, 4, 8, 16, 24]);

  // Without an order, the first theme's enabled sets are read; its source sets are only referenced.
  const themed = readInline('tokens.json', {
    core: { size: { 1: { value: '4', type: 'spacing' } } },
    compact: { gap: { 1: { value: '{size.1}', type: 'spacing' }, 2: { value: '{size.1} * 2', type: 'spacing' }, 3: { value: '{size.1} * 4', type: 'spacing' } } },
    roomy: { gap: { 1: { value: '{size.1} * 10', type: 'spacing' } } },
    $themes: [{ name: 'Compact', selectedTokenSets: { core: 'source', compact: 'enabled', roomy: 'disabled' } }],
  });
  assert.deepEqual(themed.scale, [0, 4, 8, 16]);

  // A set called `spacing` named its tokens `--spacing-*` before 3.20; they are still read by name.
  const setNamed = readInline('tokens.json', {
    spacing: { 1: { value: '4px', type: 'spacing' }, 2: { value: '8px', type: 'spacing' }, 3: { value: '16px', type: 'spacing' } },
    $metadata: { tokenSetOrder: ['spacing'] },
  });
  assert.deepEqual(Object.keys(setNamed.values), ['--spacing-1', '--spacing-2', '--spacing-3']);
  assert.deepEqual(setNamed.scale, [0, 4, 8, 16]);
  assert.equal(setNamed.source.selectedBy, 'name');

  // A reference cycle in math, or a function the evaluator does not know, is left as written: no length, no hang.
  const odd = readInline('tokens.json', {
    set: { spacing: { a: { value: '{spacing.b} * 2', type: 'spacing' }, b: { value: '{spacing.a} * 2', type: 'spacing' }, c: { value: 'roundTo(4.4)', type: 'spacing' } } },
    $metadata: { tokenSetOrder: ['set'] },
  });
  assert.deepEqual(odd.values, { '--spacing-a': '{spacing.b} * 2', '--spacing-b': '{spacing.a} * 2', '--spacing-c': 'roundTo(4.4)' });
  assert.equal(odd.scale, null);
});

test('DTCG $root is the group token; $deprecated tokens are named in the source report and stay on the 3.x scale (tf-11)', () => {
  const parsed = read(path.join(fixtures, 'dtcg-root.json'));
  assert.equal(parsed.values['--space'], '4px');
  assert.equal(parsed.values['--space-legacy-kept'], '4px', '`$deprecated: false` undoes the group');
  // In 3.x a deprecated value stays on the scale, so no finding is added; it leaves the scale in 4.0.
  assert.equal(parsed.values['--space-5'], '20px');
  assert.deepEqual(parsed.source.deprecated, ['--space-5', '--space-legacy-half']);

  // A `$root` with nothing above it has no name and is left alone.
  const top = readInline('tokens.json', { $root: { $type: 'dimension', $value: { value: 4, unit: 'px' } }, spacing: { 1: { $value: '8px' } } });
  assert.deepEqual(top.values, { '--spacing-1': '8px' });

  // A lone `$root` base (Discourse-style `--space`) still expands as a conditional base (issue #293).
  const base = readInline('tokens.json', { space: { $root: { $value: '4px' } } });
  assert.deepEqual(base.values, { '--space': '4px' });
});

test('the use-scale rule reads a role-named DTCG source through scaleSources (tf-01)', async () => {
  const result = await lintCss({
    code: '.a { margin: 12px; padding: 13px; gap: 32px; }',
    rules: { 'rhythmguard/use-scale': [true, { scale: 'auto', scaleSources: [path.join(fixtures, 'dtcg-roles.json')] }] },
  });
  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.deepEqual(result.warnings.map((warning) => warning.text), [
    'Unexpected off-scale value "13px". Use scale values (nearest: 12px or 16px). (rhythmguard/use-scale)',
  ]);
});

test('a fix never writes a $deprecated token (tf-11)', async () => {
  const result = await lintCss({
    code: '.a { margin: 19px; padding: 13px; }',
    fix: true,
    rules: { 'rhythmguard/use-scale': [true, { fixWith: 'token', scale: 'auto', scaleSources: [path.join(fixtures, 'dtcg-root.json')] }] },
  });
  assert.doesNotMatch(result.code, /--space-5\b/, '19px snaps to 20px, which only the deprecated --space-5 holds: the literal is written');
  assert.match(result.code, /margin: 20px/);
  assert.match(result.code, /padding: var\(--space-3\)/);
});
