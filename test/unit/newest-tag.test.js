'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const load = () => import(path.join(__dirname, '..', '..', 'scripts', 'ci', 'newest-tag.mjs'));

test('next is chosen only when it is ahead of latest', async () => {
  const { newestTag } = await load();
  assert.equal(newestTag({ latest: '17.16.0', next: '18.0.0-next.0' }), 'next');
  assert.equal(newestTag({ latest: '10.14.0', next: '10.0.0-rc.2' }), 'latest', 'a lagging next is ignored');
  assert.equal(newestTag({ latest: '18.0.0' }), 'latest', 'no next tag');
  assert.equal(newestTag({ latest: '18.0.0', next: '18.0.0-next.0' }), 'latest', 'a prerelease of the current release');
});
