#!/usr/bin/env node
/**
 * Prints the dist-tag of a package's newest release line: `next` when it is
 * ahead of `latest`, else `latest`. A `next` tag can lag behind (ESLint's
 * pointed at 10.0.0-rc.2 while `latest` was 10.14.0) or be removed after a
 * major ships (Stylelint's, on 18.0.0), and testing either tells us nothing.
 *
 *   node scripts/ci/newest-tag.mjs eslint   # prints next or latest
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parts(version) {
  const [core, pre] = String(version).split('-');
  return { numbers: core.split('.').map(Number), pre: pre ?? null };
}

/** True when `a` is a later version than `b`; a prerelease sorts before its release. */
export function isNewer(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i += 1) {
    if ((pa.numbers[i] || 0) !== (pb.numbers[i] || 0)) return (pa.numbers[i] || 0) > (pb.numbers[i] || 0);
  }
  if (pa.pre === pb.pre) return false;
  if (pa.pre === null) return true;
  if (pb.pre === null) return false;
  return pa.pre > pb.pre;
}

export function newestTag(distTags) {
  return distTags.next && distTags.latest && isNewer(distTags.next, distTags.latest) ? 'next' : 'latest';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const pkg = process.argv[2];
  if (!pkg) throw new Error('Usage: node scripts/ci/newest-tag.mjs <package>');
  const json = execFileSync('npm', ['view', pkg, 'dist-tags', '--json', '--registry', 'https://registry.npmjs.org'], { encoding: 'utf8' });
  console.log(newestTag(JSON.parse(json)));
}
