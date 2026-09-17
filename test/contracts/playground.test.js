'use strict';

/**
 * The browser playground runs the real rules through a bundle. Two things keep
 * it honest: the committed bundle must be what the build script produces, and
 * for the sample stylesheet on the page the bundle must report exactly what
 * Stylelint reports with the same rules (issue #57).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const bundlePath = path.join(root, 'docs', 'playground', 'rhythmguard.js');

function loadBundle() {
  const context = { clearTimeout, console, setTimeout };
  context.globalThis = context;
  context.window = context;
  context.self = context;
  vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), context, { filename: 'rhythmguard.js' });
  return context.Rhythmguard;
}

/** Values from the sandbox have another realm's prototypes; strict deep equality wants ours. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Stylelint emits warnings in rule order; the bundle sorts by position. Compare in one order. */
const byPosition = (entries) => [...entries].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]));

async function stylelintWarnings(code, rules, fix = false) {
  const { default: stylelint } = await import('stylelint');
  const result = await stylelint.lint({
    code,
    codeFilename: 'playground.css',
    config: { plugins: [path.join(root, 'src', 'index.js')], rules },
    fix,
  });
  return { output: fix ? result.code : null, warnings: result.results[0].warnings.map((w) => [w.line, w.column, w.text]) };
}

test('the committed playground bundle is what the build script produces', async () => {
  const { buildPlayground } = await import(pathToFileURL(path.join(root, 'scripts', 'build-playground.mjs')).href);
  const built = await buildPlayground({ outfile: bundlePath, write: false });
  const fresh = Buffer.from(built.outputFiles[0].contents).toString('utf8');
  const committed = fs.readFileSync(bundlePath, 'utf8');
  assert.equal(committed, fresh, 'run `npm run build:playground` and commit docs/playground/rhythmguard.js');
});

test('the bundle reports what Stylelint reports for the sample, with the recommended config', async () => {
  const Rhythmguard = loadBundle();
  const rules = Rhythmguard.configs.recommended;
  const expected = await stylelintWarnings(Rhythmguard.sample, rules);
  const actual = Rhythmguard.lint(Rhythmguard.sample, { config: 'recommended' });
  assert.ok(actual.warnings.length >= 3, 'the sample has off-scale values');
  assert.deepEqual(byPosition(plain(actual.warnings.map((w) => [w.line, w.column, w.text]))), byPosition(expected.warnings));
});

test('the bundle fixes the sample the way Stylelint does', async () => {
  const Rhythmguard = loadBundle();
  const rules = Rhythmguard.configs.recommended;
  const expected = await stylelintWarnings(Rhythmguard.sample, rules, true);
  const actual = Rhythmguard.lint(Rhythmguard.sample, { config: 'recommended', fix: true });
  assert.equal(actual.output, expected.output);
});

test('the bundle agrees with Stylelint on scale auto and prefer-token with tokens from the stylesheet', async () => {
  const Rhythmguard = loadBundle();
  const rules = {
    'rhythmguard/prefer-token': [true, { tokenMapFromCssCustomProperties: true, tokenPattern: '^--spacing-' }],
    'rhythmguard/use-scale': [true, { scale: 'auto' }],
  };
  const expected = await stylelintWarnings(Rhythmguard.sample, rules);
  const actual = Rhythmguard.lint(Rhythmguard.sample, { rules });
  const strip = (text) => text.replace(/ \([^()]*playground\.css\)/, '');
  assert.deepEqual(
    byPosition(plain(actual.warnings.map((w) => [w.line, w.column, strip(w.text)]))),
    byPosition(expected.warnings.map(([line, column, text]) => [line, column, strip(text)])),
  );
});
