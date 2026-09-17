'use strict';

// Node built-ins the core touches while discovering token files, packages and the
// rc file. In the browser nothing exists on disk, so every lookup says so.
const missing = () => { const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error; };

const fs = {
  existsSync: () => false,
  mkdirSync: () => {},
  readFileSync: missing,
  readdirSync: () => [],
  statSync: missing,
  writeFileSync: () => {},
};

const path = {
  basename: (p, ext) => { const b = p.split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
  dirname: (p) => p.split('/').slice(0, -1).join('/') || '/',
  extname: (p) => { const b = p.split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  isAbsolute: (p) => p.startsWith('/'),
  join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
  relative: (from, to) => to,
  resolve: (...parts) => { const joined = parts.filter(Boolean).join('/'); return joined.startsWith('/') ? joined : `/${joined}`; },
  sep: '/',
};

const childProcess = {
  spawnSync: () => ({ error: new Error('unavailable in the browser'), status: 1, stderr: '', stdout: '' }),
};

const os = { homedir: () => '/', tmpdir: () => '/tmp' };

const processShim = { argv: [], cwd: () => '/', env: {}, platform: 'browser', versions: {} };

module.exports = { childProcess, fs, os, path, process: processShim };
