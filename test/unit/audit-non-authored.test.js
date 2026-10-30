'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BUNDLE_MIN_BYTES,
  NON_AUTHORED_SEGMENT,
  isBuiltBundle,
  isNonAuthoredPath,
  nonAuthoredReason,
} = require('../../src/audit/non-authored');

const read = (text) => () => text;
// One line of CSS of exactly `bytes` bytes.
function oneLine(bytes) {
  const rule = '.a{padding:13px}';
  return rule.repeat(Math.ceil(bytes / rule.length)).slice(0, bytes);
}

test('the bundle threshold is 5 KB', () => {
  assert.equal(BUNDLE_MIN_BYTES, 5120);
});

test('vendored, third-party, test and generated path segments are non-authored (#161)', () => {
  const nonAuthored = [
    'vendor/normalize.css',
    'app/assets/stylesheets/vendor/pikaday.scss',
    'vendors/x.css',
    'third-party/x.css',
    'third_party/x.css',
    'thirdparty/x.css',
    'client/legacy/css/jquery-ui/jquery-ui-rtl.css',
    'font-awesome/css/all.css',
    'src/patternfly/assets/fontawesome/_bordered-pulled.scss',
    'generated/tokens.css',
    'e2e/page.css',
    '.storybook/preview.css',
    'storybook-static/main.css',
    'test/a.css',
    'tests/a.css',
    '__tests__/a.css',
    'spec/a.css',
    'fixture/a.css',
    'fixtures/a.css',
    '__fixtures__/a.css',
    '__snapshots__/a.css',
    'node_modules/pkg/a.css',
    'dist/a.css',
    'build/a.css',
    'Vendor/Upper.css',
  ];
  for (const file of nonAuthored) {
    assert.equal(isNonAuthoredPath(file), true, `${file} is non-authored`);
    assert.ok(NON_AUTHORED_SEGMENT.test(file) || /\.min\.css$/i.test(file), file);
  }
});

test('names that only contain a non-authored word stay authored (#161)', () => {
  const authored = [
    'src/vendorize.css',
    'src/library/a.css',
    // lib and libs hold the project's own code often enough to stay authored.
    'app/assets/stylesheets/lib/viewport.scss',
    'src/lib/components/button.css',
    'libs/ui/src/button.css',
    'src/components/libby.css',
    'src/latest/a.css',
    'contest/a.css',
    'styles/main.css',
    'src/fontawesome-overrides.css',
    'src/generated-by-hand.css',
    'protests/a.css',
    'src/theme.min.scss',
  ];
  for (const file of authored) {
    assert.equal(isNonAuthoredPath(file), false, `${file} is authored`);
  }
});

test('any *.min.css is non-authored, wherever it lives (#161)', () => {
  assert.equal(isNonAuthoredPath('bootstrap.min.css'), true);
  assert.equal(isNonAuthoredPath('src/styles/theme.MIN.css'), true);
  assert.equal(nonAuthoredReason('bootstrap.min.css', read('.a{}')), 'minified');
});

test('a one-line stylesheet over 5 KB is a built bundle; at 5 KB or less it is not (#161)', () => {
  assert.equal(isBuiltBundle(oneLine(BUNDLE_MIN_BYTES + 1)), true);
  assert.equal(isBuiltBundle(`${oneLine(BUNDLE_MIN_BYTES + 1)}\n`), true, 'a trailing newline does not count as a line');
  assert.equal(isBuiltBundle(oneLine(BUNDLE_MIN_BYTES)), false);
  assert.equal(isBuiltBundle(oneLine(200)), false);
});

test('a stylesheet over 5 KB on more than one line is authored (#161)', () => {
  const lines = [];
  while (lines.join('\n').length <= BUNDLE_MIN_BYTES * 2) {
    lines.push('.a { padding: 13px; }');
  }
  assert.equal(isBuiltBundle(lines.join('\n')), false);
  // A long data URI on one line of an otherwise authored file.
  assert.equal(isBuiltBundle(`.icon {\n  background: url("data:image/svg+xml,${'a'.repeat(BUNDLE_MIN_BYTES * 2)}");\n}\n`), false);
});

test('a license banner and a source map comment do not make a bundle multi-line (#161)', () => {
  const body = oneLine(BUNDLE_MIN_BYTES + 100);
  assert.equal(isBuiltBundle(`/*!\n * Library v1.2.3\n * MIT License\n */\n${body}\n/*# sourceMappingURL=app.css.map */\n`), true);
  // Comments do not count toward the size: a short body with a long banner is not a bundle.
  assert.equal(isBuiltBundle(`/* ${'x'.repeat(BUNDLE_MIN_BYTES * 2)} */\n.a{padding:13px}`), false);
});

test('nonAuthoredReason names why a stylesheet is skipped, and reads the file only when the path does not decide (#161)', () => {
  let reads = 0;
  const counting = (text) => () => {
    reads += 1;
    return text;
  };
  assert.equal(nonAuthoredReason('vendor/a.css', counting('.a{}')), 'path');
  assert.equal(nonAuthoredReason('a.min.css', counting('.a{}')), 'minified');
  assert.equal(reads, 0);
  assert.equal(nonAuthoredReason('public/app.css', counting(oneLine(BUNDLE_MIN_BYTES + 1))), 'bundle');
  assert.equal(nonAuthoredReason('src/app.css', counting('.a {\n  padding: 13px;\n}\n')), null);
  assert.equal(reads, 2);
  assert.equal(nonAuthoredReason('src/app.css', () => { throw new Error('gone'); }), null, 'an unreadable file is left to the audit');
});
