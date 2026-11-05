'use strict';

/**
 * SECURITY.md says the package makes no network requests and runs no other
 * program except `git`. This keeps that true: it fails if anything under src/
 * imports a network module, calls fetch() or a WebSocket, or starts a process
 * other than through the one git helper in the audit's file scan.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const srcDir = path.join(__dirname, '..', '..', 'src');

const NETWORK_MODULES = new Set(['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'undici', 'node-fetch', 'axios', 'ws']);
const PROCESS_ALLOWED = new Set([path.join('audit', 'scan', 'files.js')]);

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function specifiers(source) {
  const found = [];
  for (const match of source.matchAll(/(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g)) {
    found.push((match[1] || match[2]).replace(/^node:/, ''));
  }
  return found;
}

const files = listSourceFiles(srcDir).map((file) => ({ file: path.relative(srcDir, file), source: fs.readFileSync(file, 'utf8') }));

test('no source file imports a network module', () => {
  const offenders = files.flatMap(({ file, source }) => specifiers(source)
    .filter((name) => NETWORK_MODULES.has(name.split('/')[0]))
    .map((name) => `${file} imports ${name}`));
  assert.deepEqual(offenders, []);
});

test('no source file calls fetch or opens a WebSocket', () => {
  const offenders = files
    .filter(({ source }) => /\bfetch\s*\(|\bnew\s+WebSocket\b|\bXMLHttpRequest\b/.test(source))
    .map(({ file }) => file);
  assert.deepEqual(offenders, []);
});

test('only the audit file scan starts a process, and only git', () => {
  const offenders = files
    .filter(({ source }) => specifiers(source).includes('child_process'))
    .map(({ file }) => file)
    .filter((file) => !PROCESS_ALLOWED.has(file));
  assert.deepEqual(offenders, [], 'starting a process outside the git helper needs a line in SECURITY.md first');

  for (const file of PROCESS_ALLOWED) {
    const source = files.find((entry) => entry.file === file).source;
    const calls = [...source.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec|fork)\(\s*([^,)]+)/g)].map((match) => match[1].trim());
    assert.ok(calls.length > 0, `${file} no longer starts a process; drop it from the allowlist`);
    assert.deepEqual([...new Set(calls)], ["'git'"], `${file} may start only git`);
  }
});
