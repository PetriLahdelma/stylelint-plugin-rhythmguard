'use strict';

/**
 * What a token file yields when it is read as a token source: which tokens,
 * with which values and scopes. Scale inference, the audit contract and token
 * chains all start from these definitions, so a token lost or misread here
 * moves the scale everywhere.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectScssTokens,
  createTokenKindMatcher,
  customPropertyDeclarations,
  getNormalizedValueKeys,
  parseTokenSources,
} = require('../../src/core/token-sources');
const { scaleFromDefinitions } = require('../../src/core/scale-inference');

const spacing = createTokenKindMatcher('spacing');

function writeSource(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-token-parsing-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return file;
}

function parse(name, content, extra = {}) {
  const parsed = parseTokenSources({ sources: [{ path: writeSource(name, content), ...extra }] });
  const values = Object.fromEntries([...parsed.definitions].map(([token, definition]) => [token, [...definition.values].join(' | ')]));
  return { ...parsed, scale: scaleFromDefinitions(parsed.definitions), values };
}

test('a CSS token file keeps each custom property scope, so component variables stay out of the scale (issue #258)', () => {
  const parsed = parse('tokens.css', ':root{--space-1:4px;--space-2:8px;--space-3:16px;--space-4:24px} .chip{--chip-spacing:3px}');

  assert.deepEqual([...parsed.definitions.get('--space-1').scopes], ['root']);
  assert.deepEqual([...parsed.definitions.get('--chip-spacing').scopes], ['component']);
  assert.deepEqual(parsed.scale, [0, 4, 8, 16, 24]);
});

test('an unquoted url(https://...) in a CSS token file does not hide the tokens after it (issue #263)', () => {
  const parsed = parse('tokens.css', '@import url(https://fonts.example.com/x.css);:root{--space-1:4px;--space-2:8px;--space-3:16px;--space-4:24px}');

  assert.deepEqual(parsed.values, { '--space-1': '4px', '--space-2': '8px', '--space-3': '16px', '--space-4': '24px' });
  assert.deepEqual(parsed.scale, [0, 4, 8, 16, 24]);
});

test('// is not a comment in plain CSS, and in SCSS only where it does not follow a colon or a parenthesis (issue #263)', () => {
  // In a .css file `//` is not a comment, so nothing after it is skipped.
  const css = ':root { --space-1: 4px; } // :root { --space-2: 8px; }';
  assert.deepEqual(customPropertyDeclarations(css, { lineComments: false }).map((d) => d.token), ['--space-1', '--space-2']);
  assert.deepEqual(customPropertyDeclarations(css).map((d) => d.token), ['--space-1']);
  // In SCSS `//` starts a comment, except in `url(//...)` and `https://`.
  const scss = [
    '@import url(//fonts.example.com/x.css);',
    '// --space-9: 3px;',
    ':root { --space-1: 4px; --space-2: 8px; // eight',
    '  --space-3: 16px; }',
  ].join('\n');
  assert.deepEqual(customPropertyDeclarations(scss).map((d) => [d.token, d.value]), [
    ['--space-1', '4px'],
    ['--space-2', '8px'],
    ['--space-3', '16px'],
  ]);
  const sass = collectScssTokens('@import url(//fonts.example.com/x.css);\n$spacer: 8px; // base\n$spacers: (1: $spacer * .5, 2: $spacer);\n', spacing);
  assert.deepEqual(Object.fromEntries(sass.map((t) => [t.token, t.value])), { '$spacer': '8px', '$spacers.1': '4px', '$spacers.2': '8px' });

  const parsed = parse('tokens.scss', '@import url(//fonts.example.com/x.css);\n// --space-9: 3px;\n:root { --space-1: 4px; --space-2: 8px; --space-3: 16px; --space-4: 24px; }');
  assert.deepEqual(Object.keys(parsed.values), ['--space-1', '--space-2', '--space-3', '--space-4']);
});

test('a Sass variable declared inside a block does not override the top-level one in a token file (issue #266)', () => {
  const source = [
    '$spacer: 8px;',
    '$spacers: (1: $spacer * .5, 2: $spacer, 3: $spacer * 2, 4: $spacer * 3);',
    '.compact {',
    '  $spacer: 2px;',
    '  padding: $spacer;',
    '}',
    '@media (min-width: 40em) {',
    '  $spacer-lg: 40px;',
    '}',
  ].join('\n');
  const tokens = Object.fromEntries(collectScssTokens(source, spacing).map((t) => [t.token, t.value]));

  assert.deepEqual(tokens, { '$spacer': '8px', '$spacers.1': '4px', '$spacers.2': '8px', '$spacers.3': '16px', '$spacers.4': '24px' });
  assert.deepEqual(parse('tokens.scss', source).scale, [0, 4, 8, 16, 24]);
});

test('a Sass token file reads several top-level declarations on one line, and !global ones inside a block (issue #266)', () => {
  const oneLine = '$spacer: 8px; $spacers: (1: $spacer * .5, 2: $spacer, 3: $spacer * 2, 4: $spacer * 3); .compact { $spacer: 2px; padding: $spacer; }';
  assert.deepEqual(parse('tokens.scss', oneLine).scale, [0, 4, 8, 16, 24]);

  const global = '$spacer: 8px;\n@mixin dense { $spacer: 4px !global; }\n$spacers: (1: $spacer, 2: $spacer * 2);\n';
  assert.equal(Object.fromEntries(collectScssTokens(global, spacing).map((t) => [t.token, t.value]))['$spacer'], '4px');

  // Mixin parameters and module configuration are not declarations of this file.
  const params = '@mixin pad(\n  $spacer: 3px\n) { padding: $spacer; }\n@use "theme" with ($spacer: 5px);\n$spacer: 8px;\n';
  assert.deepEqual(collectScssTokens(params, spacing), [{ token: '$spacer', value: '8px' }]);
});

test('DTCG aliases resolve within the file before the kind filter (issue #267)', () => {
  const parsed = parse('tokens.json', {
    dimension: {
      $type: 'dimension',
      100: { $value: '4px' },
      200: { $value: '8px' },
      400: { $value: '16px' },
      600: { $value: '24px' },
    },
    spacing: {
      xs: { $value: '{dimension.100}' },
      sm: { $value: '{dimension.200}' },
      md: { $value: '{dimension.400}' },
      lg: { $value: '{spacing.md}' },
      xl: { $value: '{dimension.600}' },
    },
  });

  assert.deepEqual(parsed.values, {
    '--spacing-lg': '16px',
    '--spacing-md': '16px',
    '--spacing-sm': '8px',
    '--spacing-xl': '24px',
    '--spacing-xs': '4px',
  });
  assert.deepEqual(parsed.scale, [0, 4, 8, 16, 24]);
});

test('Style Dictionary references ({path.value} and {path}) resolve; cycles and missing targets are kept as written (issue #267)', () => {
  const parsed = parse('tokens.json', {
    size: { base: { value: '4px' } },
    spacing: {
      sm: { value: '{size.base.value}' },
      md: { value: '8px' },
      lg: { value: '{spacing.xl}' },
      xl: { value: '24px' },
      loop: { value: '{spacing.loop2.value}' },
      loop2: { value: '{spacing.loop}' },
      missing: { value: '{size.nothing.value}' },
    },
  });

  assert.equal(parsed.values['--spacing-sm'], '4px');
  assert.equal(parsed.values['--spacing-lg'], '24px');
  assert.equal(parsed.values['--spacing-loop'], '{spacing.loop2.value}');
  assert.equal(parsed.values['--spacing-loop2'], '{spacing.loop}');
  assert.equal(parsed.values['--spacing-missing'], '{size.nothing.value}');
  assert.deepEqual(parsed.scale, [0, 4, 8, 24]);
});

test('DTCG 2025.10 dimension objects are read, aliases resolve through them, unknown units are skipped with a warning (issue #163)', () => {
  const parsed = parse('tokens.json', {
    spacing: {
      $type: 'dimension',
      1: { $value: { value: 4, unit: 'px' } },
      2: { $value: { value: 8, unit: 'px' } },
      3: { $value: { value: 0.75, unit: 'rem' } },
      4: { $value: { value: 1, unit: 'rem' } },
      card: { $value: '{spacing.3}' },
      print: { $value: { value: 12, unit: 'pt' } },
    },
  });

  assert.equal(parsed.sources[0].format, 'dtcg');
  assert.deepEqual(parsed.values, {
    '--spacing-1': '4px',
    '--spacing-2': '8px',
    '--spacing-3': '0.75rem',
    '--spacing-4': '1rem',
    '--spacing-card': '0.75rem',
  });
  assert.deepEqual(parsed.scale, [0, 4, 8, 12, 16]);
  assert.equal(parsed.warnings.length, 1, parsed.warnings.join('\n'));
  assert.match(parsed.warnings[0], /--spacing-print.*unit "pt"/);
  assert.deepEqual(parsed.sources[0].warnings, parsed.warnings);
});

test('DTCG $ref tokens resolve through JSON Pointers; a group that carries $ref is still a group (issue #163)', () => {
  const parsed = parse('tokens.json', {
    base: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
    spacing: {
      $type: 'dimension',
      1: { $value: { value: 4, unit: 'px' } },
      md: { $ref: '#/base/md/$value' },
      alias: { $value: '{spacing.md}' },
      gone: { $ref: '#/base/lg/$value' },
      loop: { $ref: '#/spacing/loop2/$value' },
      loop2: { $value: '{spacing.loop}' },
    },
    layout: {
      $ref: '#/base',
      'spacing-2': { $value: { value: 8, unit: 'px' } },
    },
  });

  assert.deepEqual(parsed.values, {
    '--layout-spacing-2': '8px',
    '--spacing-1': '4px',
    '--spacing-alias': '16px',
    '--spacing-loop2': '{spacing.loop}',
    '--spacing-md': '16px',
  });
  assert.equal(parsed.warnings.length, 1, parsed.warnings.join('\n'));
  assert.match(parsed.warnings[0], /--spacing-gone \(reference "#\/base\/lg\/\$value" does not resolve\)/);
  assert.match(parsed.warnings[0], /--spacing-loop \(reference cycle through "#\/spacing\/loop2\/\$value"\)/);
});

test('a configured token source with no tokens of the kind read warns, naming the file and its format, when asked to (issue #163)', () => {
  const colors = writeSource('colors.json', { color: { $type: 'color', brand: { $value: { colorSpace: 'srgb', components: [0, 0, 1] } } } });
  const empty = writeSource('empty.css', '.card { padding: 4px; }\n');
  const spaced = writeSource('tokens.json', { spacing: { 1: { $value: '4px' } } });
  const missing = path.join(path.dirname(spaced), 'missing.json');
  const sources = [{ path: colors }, { path: empty }, { path: spaced }, { path: missing }];

  // Off by default: the API reads token files without new warnings.
  assert.deepEqual(parseTokenSources({ sources }).warnings, [`Token source not found: ${missing}`]);

  const parsed = parseTokenSources({ sources, warnWhenEmpty: true });
  const hint = 'spacing tokens are read by name (space, spacing or spacer), so set a tokenPattern on this source if its tokens are named otherwise';
  assert.deepEqual(parsed.sources.map((source) => source.warnings), [
    [`Token source ${colors} (dtcg) yielded no spacing tokens; ${hint}.`],
    [`Token source ${empty} (css) yielded no spacing tokens; ${hint}.`],
    [],
    [`Token source not found: ${missing}`],
  ]);
  assert.deepEqual(parsed.warnings, parsed.sources.flatMap((source) => source.warnings));

  // The warning names what was read: another kind, every token, a tokenPattern.
  assert.deepEqual(parseTokenSources({ sources: [{ path: colors }], tokenKind: 'radius', warnWhenEmpty: true }).warnings, [`Token source ${colors} (dtcg) yielded no radius tokens.`]);
  assert.deepEqual(parseTokenSources({ sources: [{ path: empty }], tokenKind: 'all', warnWhenEmpty: true }).warnings, [`Token source ${empty} (css) yielded no tokens.`]);
  assert.deepEqual(parseTokenSources({ sources: [{ path: colors, tokenPattern: '^--size-' }], warnWhenEmpty: true }).warnings, [`Token source ${colors} (dtcg) yielded no tokens matching tokenPattern "^--size-".`]);

  // A file that does not parse says so, once, and nothing more.
  const broken = writeSource('broken.json', '{ "spacing": ');
  const brokenWarnings = parseTokenSources({ sources: [{ path: broken }], warnWhenEmpty: true }).warnings;
  assert.equal(brokenWarnings.length, 1);
  assert.match(brokenWarnings[0], /^Unable to parse token source /);
});

test('non-zero unitless token values are not lengths; zero and flat-JSON numbers still are (issue #268)', () => {
  const css = parse('tokens.css', ':root{--space-1:4px;--space-2:8px;--space-3:16px;--space-ratio:1.5;--spacing-scale:3;--space-0:0}');
  assert.deepEqual(css.scale, [0, 4, 8, 16]);
  assert.deepEqual(getNormalizedValueKeys('1.5'), ['1.5']);
  assert.deepEqual(getNormalizedValueKeys('0'), ['0', '0px']);

  const dtcg = parse('tokens.json', { spacing: { 1: { $value: '4px' }, 2: { $value: '8px' }, 3: { $value: '16px' }, ratio: { $value: 1.5 } } });
  assert.deepEqual(dtcg.scale, [0, 4, 8, 16]);

  const flat = parse('tokens.json', { 'space-1': 4, 'space-2': 8, 'space-3': 16 });
  assert.deepEqual(flat.values, { '--space-1': '4px', '--space-2': '8px', '--space-3': '16px' });
  assert.deepEqual(flat.scale, [0, 4, 8, 16]);
});

test('a comment or a trailing !important inside a custom property value does not drop the token (issue #269)', () => {
  const parsed = parse('tokens.css', ':root { --space-1: 4px !important; --space-2: 8px /* 0.5rem */; --space-3: /* x */ 16px ! IMPORTANT; --space-4: 24px; }');

  assert.deepEqual(parsed.values, { '--space-1': '4px', '--space-2': '8px', '--space-3': '16px', '--space-4': '24px' });
  assert.deepEqual(parsed.scale, [0, 4, 8, 16, 24]);
  // A semicolon inside a string or a comment does not end the value.
  assert.deepEqual(
    customPropertyDeclarations(':root { --space-1: 4px /* a; b */; --font: "a;b"; }').map((d) => [d.token, d.value]),
    [['--space-1', '4px'], ['--font', '"a;b"']],
  );
});

test('a token file saved with a UTF-8 byte order mark is read like one without (issue #291)', () => {
  const json = parse('tokens.json', `\uFEFF${JSON.stringify({ spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px' } })}`);
  assert.deepEqual(json.warnings, []);
  assert.deepEqual(json.scale, [0, 4, 8, 12, 16]);

  const css = parse('tokens.css', '\uFEFF:root { --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; }');
  assert.deepEqual(css.warnings, []);
  assert.deepEqual(css.scale, [0, 4, 8, 12, 16]);
});
