#!/usr/bin/env node
/**
 * Regenerates the typescript-estree ASTs the class-context tests replay
 * (test/helpers/fixture-ts-parser.js). typescript-eslint does not run on the
 * TypeScript 7 this repo builds with, so the ASTs are produced once with a
 * TypeScript 5 toolchain installed outside the repo:
 *
 *   mkdir /tmp/tsast && cd /tmp/tsast && npm init -y \
 *     && npm i --registry https://registry.npmjs.org typescript@5.9 \
 *       @typescript-eslint/typescript-estree@8 @typescript-eslint/visitor-keys@8
 *   TSAST_ROOT=/tmp/tsast node test/fixtures/ts-class-context/generate.mjs
 *
 * `loc` is dropped (the helper rebuilds it from `range`) to keep the JSON small.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolve from the TypeScript 5 toolchain, never from this repo's node_modules.
const require = createRequire(path.join(process.env.TSAST_ROOT || here, 'package.json'));
const { parse } = require('@typescript-eslint/typescript-estree');
const { visitorKeys } = require('@typescript-eslint/visitor-keys');

function strip(value) {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'loc' || key === 'parent') {
        continue;
      }
      out[key] = strip(child);
    }
    return out;
  }
  return value;
}

function nodeTypes(value, types = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((child) => nodeTypes(child, types));
  } else if (value && typeof value === 'object') {
    if (typeof value.type === 'string' && Array.isArray(value.range)) {
      types.add(value.type);
    }
    Object.values(value).forEach((child) => nodeTypes(child, types));
  }
  return types;
}

const asts = {};
const types = new Set();
for (const file of ['probe.tsx', 'probe.fixed.tsx']) {
  const code = fs.readFileSync(path.join(here, file), 'utf8');
  const ast = parse(code, { comment: true, jsx: true, loc: true, range: true, tokens: true });
  nodeTypes(ast, types);
  asts[file] = strip(ast);
}

const keys = {};
for (const type of [...types].sort()) {
  if (visitorKeys[type]) {
    keys[type] = visitorKeys[type];
  }
}

fs.writeFileSync(path.join(here, 'asts.json'), `${JSON.stringify({ asts, visitorKeys: keys })}\n`);
