'use strict';

const fs = require('node:fs');

/**
 * Editors and pre-commit hooks lint one file at a time, and each lint asks the
 * filesystem the same questions: which package.json files sit between cwd and
 * the repository, what .rhythmguardrc.json says, whether a token package is
 * installed. The answers change only when one of those files changes, so a
 * result is cached per key and revalidated by the mtime of every file the
 * computation consulted: a stat per file instead of a read, a parse and a walk.
 */
const cache = new Map();

function fileStamp(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function cachedByFiles(cacheKey, compute) {
  const cached = cache.get(cacheKey);
  if (cached && cached.stamps.every(([file, stamp]) => fileStamp(file) === stamp)) {
    return cached.value;
  }
  const consulted = [];
  const value = compute((file) => consulted.push([file, fileStamp(file)]));
  cache.set(cacheKey, { stamps: consulted, value });
  return value;
}

module.exports = {
  cachedByFiles,
};
