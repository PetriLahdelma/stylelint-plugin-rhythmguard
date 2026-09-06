#!/usr/bin/env node
/**
 * Runs the test suite with Node's built-in runner. Node 20 does not expand
 * glob patterns passed to `--test` (Node 21 added that), and `node --test`
 * without arguments would also pick up test files inside the benchmark
 * checkouts under benchmarks/quiet/repos. So: collect test/**\/*.test.js here
 * and hand the runner an explicit list. Extra arguments are forwarded
 * (`--watch`, `--test-name-pattern`, a subset of files).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(repoRoot, 'test');

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

const forwarded = process.argv.slice(2);
const files = forwarded.some((arg) => !arg.startsWith('-')) ? [] : collect(testRoot);
const result = spawnSync(process.execPath, ['--test', ...forwarded, ...files], { cwd: repoRoot, stdio: 'inherit' });
process.exit(result.status ?? 1);
