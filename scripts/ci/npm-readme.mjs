#!/usr/bin/env node
/**
 * npmjs.com renders the README from the published tarball on a white page, where
 * the transparent SVG banner that suits GitHub is hard to read. The release job
 * runs this in its throwaway checkout right before `npm publish`: the banner
 * image becomes the non-transparent PNG (same cache key), and nothing else in
 * the README changes. It fails when the banner line is not found exactly once,
 * so a README edit cannot silently ship the wrong banner.
 *
 *   node scripts/ci/npm-readme.mjs            # rewrite README.md in place
 *   node scripts/ci/npm-readme.mjs --check    # print the result, change nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SVG = /assets\/rhythmguard-banner\.svg(\?v=\d+)/g;

export function toNpmReadme(readme) {
  const matches = readme.match(SVG) || [];
  if (matches.length !== 1) {
    throw new Error(`expected the banner SVG exactly once in README.md, found ${matches.length}`);
  }
  return readme.replace(SVG, 'assets/rhythmguard-banner.png$1');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'README.md');
  const next = toNpmReadme(fs.readFileSync(file, 'utf8'));
  if (process.argv.includes('--check')) {
    process.stdout.write(`${next.split('\n').find((line) => line.includes('rhythmguard-banner'))}\n`);
  } else {
    fs.writeFileSync(file, next);
    process.stdout.write('README.md: banner switched to the PNG for npmjs.com\n');
  }
}
