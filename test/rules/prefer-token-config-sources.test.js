'use strict';

/**
 * prefer-token and use-scale's `fixWith: "token"` read tokens through one
 * resolver (issue #202): the stylesheet, `scaleSources`, the token sources in
 * `.rhythmguardrc.json` and installed token packages, filtered to the
 * property's kind. These tests pin that the two rules know the same tokens
 * and never offer a radius token for a padding.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintCss } = require('../helpers/lint');

const VARIABLES = [
  ':root {',
  '  --space-internal-8: 0.5rem;',
  '  --space-internal-16: 1rem;',
  '  --space-layout-24: 1.5rem;',
  '  --space-gutter-24: 1.5rem;',
  '  --space-hairline: 2px;',
  '  --radius-xl: 1rem;',
  '}',
].join('\n');

const TOKEN_PATTERN = '^--space-|^--radius-';

function projectWithRc() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-prefer-token-rc-'));
  fs.mkdirSync(path.join(dir, 'styles'));
  fs.writeFileSync(path.join(dir, 'styles', 'variables.css'), VARIABLES);
  fs.writeFileSync(path.join(dir, '.rhythmguardrc.json'), JSON.stringify({
    audit: { tokenSources: [{ path: './styles/variables.css', format: 'css' }] },
  }));
  return dir;
}

async function inProject(dir, run) {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

const preferToken = (extra = {}) => ({ 'rhythmguard/prefer-token': [true, { propertyGroups: ['spacing', 'radius'], tokenPattern: TOKEN_PATTERN, ...extra }] });

test('prefer-token names and writes a token declared in the .rhythmguardrc.json token sources', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({
    code: '.a { padding: 1rem; margin: 0.5rem; border-radius: 1rem; }',
    fix: true,
    rules: preferToken(),
  }));

  assert.deepEqual(result.invalidOptionWarnings, []);
  assert.equal(result.code, '.a { padding: var(--space-internal-16); margin: var(--space-internal-8); border-radius: var(--radius-xl); }');
});

test('the message names the token and the file it comes from, not "no known token"', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({ code: '.a { padding: 1rem; }', rules: preferToken() }));

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].text, /^Unexpected raw scale value "1rem"\. Use var\(--space-internal-16\) \(styles\/variables\.css\)\./);
  assert.doesNotMatch(result.warnings[0].text, /No known token/);
});

test('a padding is never pointed at a radius token, even when the pattern admits both and they hold the same value', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({ code: '.a { padding: 1rem; }', rules: preferToken() }));

  assert.doesNotMatch(result.warnings[0].text, /radius/);
});

test('when several tokens hold the value, all are named and nothing is written', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({ code: '.a { gap: 1.5rem; }', fix: true, rules: preferToken() }));

  assert.equal(result.code, '.a { gap: 1.5rem; }');
  const linted = await inProject(dir, () => lintCss({ code: '.a { gap: 1.5rem; }', rules: preferToken() }));
  assert.equal(
    linted.warnings[0].text,
    'Unexpected raw scale value "1.5rem". Use one of the tokens that hold it: var(--space-gutter-24) or var(--space-layout-24). (rhythmguard/prefer-token)',
  );
});

test('a token in another unit is named but not written, as use-scale\'s fixWith: "token" would not write it', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({ code: '.a { padding: 16px; }', fix: true, rules: preferToken() }));
  assert.equal(result.code, '.a { padding: 16px; }');

  const linted = await inProject(dir, () => lintCss({ code: '.a { padding: 16px; }', rules: preferToken() }));
  assert.match(linted.warnings[0].text, /Use var\(--space-internal-16\)/);
});

test('a value no token holds keeps the message it had, so text-keyed baselines do not churn', async () => {
  const dir = projectWithRc();
  const result = await inProject(dir, () => lintCss({ code: '.a { padding: 0.875rem; }', rules: preferToken() }));

  assert.equal(
    result.warnings[0].text,
    'Unexpected raw scale value "0.875rem". No known token holds this value; use the nearest token or add one. (rhythmguard/prefer-token)',
  );
});

test('prefer-token and use-scale fixWith: "token" write the same token for the same value', async () => {
  const dir = projectWithRc();
  const cases = [
    // [prefer-token input, use-scale input that snaps to the same value, property]
    ['1rem', '0.9rem', 'padding'],
    ['0.5rem', '0.45rem', 'margin'],
    ['1rem', '0.9rem', 'border-radius'],
  ];

  for (const [onToken, offScale, prop] of cases) {
    const preferred = await inProject(dir, () => lintCss({ code: `.a { ${prop}: ${onToken}; }`, fix: true, rules: preferToken() }));
    const snapped = await inProject(dir, () => lintCss({
      code: `.a { ${prop}: ${offScale}; }`,
      fix: true,
      rules: {
        'rhythmguard/use-scale': [true, {
          fixWith: 'token',
          propertyGroups: ['spacing', 'radius'],
          scale: [0, 4, 8, 16, 24],
          tokenPattern: TOKEN_PATTERN,
        }],
      },
    }));
    assert.equal(snapped.code, preferred.code, `${prop}: ${onToken} and ${prop}: ${offScale} disagree`);
  }
});
