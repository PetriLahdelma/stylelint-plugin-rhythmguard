'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { cacheSize } = require('../../src/core/fs-cache');
const { resolveAutoScale } = require('../../src/core/scale-inference');

test('editing a token source many times keeps one cache entry and reads the latest file (issue #264)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythmguard-source-cache-'));
  fs.mkdirSync(path.join(dir, '.git'));
  const tokens = path.join(dir, 'tokens.css');
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    let sizeAfterFirst = null;
    for (let edit = 1; edit <= 40; edit += 1) {
      fs.writeFileSync(tokens, `:root { --space-1: ${edit}px; --space-2: ${edit * 2}px; --space-3: ${edit * 3}px; }`);
      // Each edit gets a distinct mtime, as a save in an editor does.
      const stamp = new Date(Date.UTC(2026, 0, 1) + edit * 1000);
      fs.utimesSync(tokens, stamp, stamp);

      const inference = resolveAutoScale({ scaleSources: [tokens] });
      assert.deepEqual(inference.scale, [0, edit, edit * 2, edit * 3], `edit ${edit} is read`);
      if (sizeAfterFirst === null) {
        sizeAfterFirst = cacheSize();
      }
      assert.equal(cacheSize(), sizeAfterFirst, `edit ${edit} replaces the entry instead of adding one`);
    }
  } finally {
    process.chdir(previousCwd);
  }
});
