'use strict';

const path = require('node:path');

const { normalizeTokenSourceFormat } = require('./token-sources');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * One reading of a token source entry, shared by the lint (`scaleSources`,
 * `.rhythmguardrc.json`) and the audit (config file, CLI, API), so both read
 * the same files from the same config (issue #271). An entry is a path string
 * or an object with `path` (or its alias `file`), and optionally `format`,
 * `baseDir` (resolved from `baseDir` given here, the config file's directory
 * for a config file) and `tokenPattern`.
 *
 * Returns `{ source }` with `{ baseDir, format, path, tokenPattern? }`, ready
 * for parseTokenSources, or `{ error }` with a message; it never throws, so
 * the lint can turn a bad entry into a warning and the audit into an error.
 */
function normalizeTokenSourceEntry(entry, baseDir, { defaultFormat = 'auto' } = {}) {
  if (typeof entry === 'string') {
    entry = { path: entry };
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { error: 'audit.tokenSources entries must be strings or objects.' };
  }

  const sourcePath = entry.path || entry.file;
  if (!isNonEmptyString(sourcePath)) {
    return { error: 'token source objects must include a path.' };
  }

  if (entry.tokenPattern !== undefined && !isNonEmptyString(entry.tokenPattern)) {
    return { error: 'token source tokenPattern must be a non-empty string.' };
  }

  if (entry.baseDir !== undefined && !isNonEmptyString(entry.baseDir)) {
    return { error: 'token source baseDir must be a non-empty string.' };
  }

  let format;
  try {
    format = normalizeTokenSourceFormat(entry.format || defaultFormat);
  } catch (err) {
    return { error: err.message };
  }

  return {
    source: {
      baseDir: entry.baseDir ? path.resolve(baseDir, entry.baseDir) : baseDir,
      format,
      path: sourcePath,
      ...(entry.tokenPattern ? { tokenPattern: entry.tokenPattern } : {}),
    },
  };
}

module.exports = {
  normalizeTokenSourceEntry,
};
