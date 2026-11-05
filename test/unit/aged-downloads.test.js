'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const load = () => import(path.join(__dirname, '..', '..', 'scripts', 'metrics', 'aged-downloads.mjs'));
const now = new Date('2026-11-05T12:00:00Z');

test('aged downloads count versions 14 or more days old and drop a version that is most of the week', async () => {
  const { summarize } = await load();
  const result = summarize(
    { '3.6.0': 2016, '3.14.0': 315, '3.16.1': 257, '3.17.0': 179 },
    { '3.6.0': '2026-10-01T00:00:00Z', '3.14.0': '2026-10-19T00:00:00Z', '3.16.1': '2026-11-01T00:00:00Z', '3.17.0': '2026-11-04T00:00:00Z' },
    now,
  );
  assert.deepEqual(result, { total: 2767, aged: 2331, pinVersion: '3.6.0', pinCount: 2016, exPin: 315 });
});

test('a version that is not more than half of the week is not treated as a pin', async () => {
  const { summarize } = await load();
  const result = summarize({ '3.8.0': 5, '3.17.0': 735 }, { '3.8.0': '2026-09-27T00:00:00Z', '3.17.0': '2026-11-04T00:00:00Z' }, now);
  assert.deepEqual(result, { total: 740, aged: 5, pinVersion: null, pinCount: 0, exPin: 5 });
});
