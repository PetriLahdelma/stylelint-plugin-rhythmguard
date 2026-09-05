'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const modulePath = path.join(__dirname, '..', 'scripts', 'bench', 'quiet-classify.mjs');

async function load() {
  return import(pathToFileURL(modulePath).href);
}

const rules = {
  allowances: [
    { category: 'allowance:hairline', values: ['1px', '-1px', '0.5px'] },
  ],
  noisePaths: [
    { category: 'noise:non-authored', pattern: '(^|/)(vendor|third-party|node_modules|dist|build|generated|__snapshots__|fixtures?|tests?|__tests__|e2e|storybook-static|\\.storybook)(/|$)' },
    { category: 'noise:minified', pattern: '\\.min\\.css$' },
  ],
};

test('classifyFinding labels generated and vendor paths as noise', async () => {
  const { classifyFinding } = await load();
  assert.equal(classifyFinding({ file: 'packages/ui/dist/index.css', value: '13px' }, rules).category, 'noise:non-authored');
  assert.equal(classifyFinding({ file: 'src/vendor/normalize.css', value: '13px' }, rules).category, 'noise:non-authored');
  assert.equal(classifyFinding({ file: 'public/app.min.css', value: '13px' }, rules).category, 'noise:minified');
});

test('classifyFinding labels hairline offsets as allowances and everything else as drift', async () => {
  const { classifyFinding } = await load();
  assert.equal(classifyFinding({ file: 'src/button.css', value: '1px' }, rules).category, 'allowance:hairline');
  assert.equal(classifyFinding({ file: 'src/button.css', value: '-1px' }, rules).category, 'allowance:hairline');
  const drift = classifyFinding({ file: 'src/button.css', value: '13px' }, rules);
  assert.equal(drift.category, 'drift');
});

test('classifyFinding lets per-repo manual labels override heuristics', async () => {
  const { classifyFinding } = await load();
  const labels = { 'src/button.css:12': { category: 'allowance:reviewed', reason: 'optical alignment, maintainer confirmed' } };
  const result = classifyFinding({ file: 'src/button.css', line: 12, value: '13px' }, rules, labels);
  assert.equal(result.category, 'allowance:reviewed');
  assert.match(result.reason, /maintainer confirmed/);
});

test('summarize computes the false-positive rate from noise and allowance categories', async () => {
  const { summarize } = await load();
  const classified = [
    { category: 'drift' },
    { category: 'drift' },
    { category: 'drift' },
    { category: 'noise:non-authored' },
    { category: 'allowance:hairline' },
  ];
  const summary = summarize(classified);
  assert.equal(summary.total, 5);
  assert.equal(summary.drift, 3);
  assert.equal(summary.falsePositives, 2);
  assert.equal(summary.falsePositiveRate, 40);
  assert.deepEqual(summary.byCategory, { 'allowance:hairline': 1, drift: 3, 'noise:non-authored': 1 });
  assert.equal(summarize([]).falsePositiveRate, 0);
});
