'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function load() {
  return import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'bench', 'state-of-spacing.mjs')).href);
}

function result(overrides) {
  return {
    name: 'acme',
    url: 'https://github.com/acme/ds.git',
    sha: 'abc1234',
    cssFilesScanned: 50,
    scaleCleanliness: 80,
    scale: { source: 'scanned-css', values: [0, 4, 8, 12, 16], tokenCount: 5, files: ['tokens.css'] },
    summary: { total: 25, drift: 20, falsePositiveRate: 0 },
    classified: [
      ...Array.from({ length: 12 }, () => ({ category: 'drift', value: '10px', property: 'margin-bottom', file: 'a.css', line: 1 })),
      ...Array.from({ length: 5 }, () => ({ category: 'drift', value: '15px', property: 'padding', file: 'a.css', line: 2 })),
      ...Array.from({ length: 3 }, () => ({ category: 'drift', value: '6px', property: 'gap', file: 'a.css', line: 3 })),
      ...Array.from({ length: 5 }, () => ({ category: 'noise:non-authored', value: '13px', property: 'padding', file: 'test/a.css', line: 4 })),
    ],
    ...overrides,
  };
}

test('buildEdition ranks repositories by drift density and keeps top values and properties from drift only', async () => {
  const { buildEdition } = await load();
  const edition = buildEdition([
    result(),
    result({ name: 'big', cssFilesScanned: 400, summary: { total: 40, drift: 40, falsePositiveRate: 0 }, scaleCleanliness: 95 }),
  ], { id: '2026-09' });

  assert.equal(edition.id, '2026-09');
  assert.equal(edition.rows.length, 2);
  assert.deepEqual(edition.rows.map((row) => row.name), ['acme', 'big'], 'acme has 40 per 100 files, big has 10');
  const acme = edition.rows[0];
  assert.equal(acme.drift, 20);
  assert.equal(acme.driftPer100Files, 40);
  assert.equal(acme.cleanliness, 80);
  assert.deepEqual(acme.topValues, [['10px', 12], ['15px', 5], ['6px', 3]]);
  assert.deepEqual(acme.topProperties, [['margin-bottom', 12], ['padding', 5], ['gap', 3]], 'noise findings do not count');
  assert.equal(acme.scaleSource, 'scanned-css');
});

test('buildEdition reports the change since the previous edition per repository', async () => {
  const { buildEdition } = await load();
  const previous = buildEdition([result({ summary: { total: 30, drift: 30, falsePositiveRate: 0 } })], { id: '2026-06' });
  const edition = buildEdition([result(), result({ name: 'newcomer' })], { id: '2026-09', previous });

  const acme = edition.rows.find((row) => row.name === 'acme');
  assert.equal(acme.driftDelta, -10);
  assert.equal(edition.rows.find((row) => row.name === 'newcomer').driftDelta, null);
  assert.equal(edition.previousId, '2026-06');
});

test('renderEdition writes a dated Markdown report with the ranking, property table and reproduction command', async () => {
  const { buildEdition, renderEdition } = await load();
  const edition = buildEdition([result()], { id: '2026-09' });
  const markdown = renderEdition(edition);

  assert.match(markdown, /^# State of Spacing, 2026-09/m);
  assert.match(markdown, /\| \[acme\]\(https:\/\/github\.com\/acme\/ds\) \| `abc1234` \| scanned-css \| 20 \| 40 \| 80% \|/);
  assert.match(markdown, /`10px` ×12, `15px` ×5, `6px` ×3/);
  assert.match(markdown, /`margin-bottom` ×12, `padding` ×5, `gap` ×3/);
  assert.match(markdown, /npx rhythmguard audit \. --scale auto --format markdown/);
  assert.match(markdown, /not a ranking of teams/i);
});

test('renderEdition shows deltas with a sign and marks new rows', async () => {
  const { buildEdition, renderEdition } = await load();
  const previous = buildEdition([result({ summary: { total: 30, drift: 30, falsePositiveRate: 0 } })], { id: '2026-06' });
  const markdown = renderEdition(buildEdition([result(), result({ name: 'newcomer' })], { id: '2026-09', previous }));

  assert.match(markdown, /\| -10 \|/);
  assert.match(markdown, /\| new \|/);
  assert.match(markdown, /since 2026-06/);
});

test('assessScale flags inferred scales that do not look like a spacing scale', async () => {
  const { assessScale } = await load();
  const ok = (scale) => assessScale(scale).plausible;

  assert.equal(ok({ source: 'scanned-css', values: [0, 4, 8, 12, 16, 24, 32], files: ['src/tokens/space.css'] }), true);
  assert.equal(ok({ source: 'scanned-css', values: [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64], files: ['src/_primitives.scss', 'src/markdown.scss', 'src/markdown.scss'] }), true, 'mostly multiples of four passes even from mixed files');
  assert.equal(ok({ source: 'scanned-css', values: [0, 2, 3, 5, 6, 25], files: ['web/styles/app_variables.css'] }), false, 'zulip: not a spacing ladder');
  assert.equal(ok({ source: 'scanned-css', values: [0, 1, 2, 10, 12, 16, 20, 22, 32], files: ['core/src/components/Avatar/Avatar.module.css', 'core/src/components/Chip/Chip.module.css', 'core/src/core/MantineProvider/default-css-variables.css'] }), false, 'mantine: polluted by component-local variables');
  assert.equal(ok({ source: 'scanned-css', values: [0, 0.4, 0.7, 0.8, 1, 1.1, 1.4, 2, 3, 4], files: ['a/variables.scss'] }), false, 'fractional values');
  assert.equal(ok({ source: 'fallback', values: [0, 4, 8], files: [] }), false, 'fallback is never plausible');
  assert.equal(ok({ source: 'token-sources', values: [0, 4, 8, 12], files: ['tokens.json'] }), true, 'explicit sources are trusted');
});

test('buildEdition marks unreliable scales and counts them with fallbacks', async () => {
  const { buildEdition, renderEdition } = await load();
  const edition = buildEdition([
    result({ name: 'zulip', scale: { source: 'scanned-css', values: [0, 2, 3, 5, 6, 25], tokenCount: 12, files: ['web/styles/app_variables.css'] } }),
    result(),
  ], { id: '2026-09' });

  const zulip = edition.rows.find((row) => row.name === 'zulip');
  assert.equal(zulip.scaleReliable, false);
  assert.equal(edition.rows.find((row) => row.name === 'acme').scaleReliable, true);
  assert.equal(edition.totals.unreliableScales, 1);
  const markdown = renderEdition(edition);
  assert.match(markdown, /\| \[zulip\]\([^)]*\) \| `abc1234` \| scanned-css \(unreliable\) \|/);
  assert.match(markdown, /1 more had an inference the plausibility check rejected/);
});
