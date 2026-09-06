'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { badgeColor, renderBadge } = require('../src/audit/render-badge');

test('renderBadge emits a shields.io endpoint document for spacing drift', () => {
  const report = { scaleCleanliness: 97, findings: { css: [], tailwind: [] } };
  const badge = JSON.parse(renderBadge(report));

  assert.deepEqual(badge, {
    schemaVersion: 1,
    label: 'spacing drift',
    message: '3%',
    color: 'green',
  });
});

test('renderBadge can report the off-scale finding count instead', () => {
  const report = {
    scaleCleanliness: 50,
    findings: {
      css: [{ type: 'off-scale' }, { type: 'off-scale' }, { type: 'token-opportunity' }],
      tailwind: [{ token: 'p-[13px]' }],
    },
  };
  const badge = JSON.parse(renderBadge(report, { metric: 'findings' }));

  assert.equal(badge.label, 'off-scale values');
  assert.equal(badge.message, '3');
  assert.equal(badge.color, 'green');
});

test('badgeColor thresholds for drift percent', () => {
  assert.equal(badgeColor('drift', 0), 'brightgreen');
  assert.equal(badgeColor('drift', 2), 'brightgreen');
  assert.equal(badgeColor('drift', 3), 'green');
  assert.equal(badgeColor('drift', 5), 'green');
  assert.equal(badgeColor('drift', 6), 'yellow');
  assert.equal(badgeColor('drift', 15), 'yellow');
  assert.equal(badgeColor('drift', 16), 'orange');
});

test('badgeColor thresholds for finding counts', () => {
  assert.equal(badgeColor('findings', 0), 'brightgreen');
  assert.equal(badgeColor('findings', 10), 'green');
  assert.equal(badgeColor('findings', 11), 'yellow');
  assert.equal(badgeColor('findings', 50), 'yellow');
  assert.equal(badgeColor('findings', 51), 'orange');
});

test('renderBadge rejects an unknown metric', () => {
  assert.throws(() => renderBadge({ scaleCleanliness: 100, findings: { css: [], tailwind: [] } }, { metric: 'vibes' }), /badge metric/);
});
