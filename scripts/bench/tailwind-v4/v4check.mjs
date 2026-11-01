#!/usr/bin/env node
/**
 * Tailwind v4 sample, step 2 of 3: which candidates ship Tailwind v4. Reads
 * pool.json, checks the top N TypeScript and JavaScript repos (default 400; the
 * 2026-11-01 run used 500) and writes v4.json: every package.json outside
 * examples, templates and tests that depends on tailwindcss 4 or an
 * @tailwindcss/* v4 package.
 *
 *   node v4check.mjs 500
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { fetch } = globalThis;
const pool = JSON.parse(fs.readFileSync('pool.json', 'utf8')).filter((r) => ['TypeScript', 'JavaScript', 'MDX'].includes(r.lang));
const done = fs.existsSync('v4.json') ? JSON.parse(fs.readFileSync('v4.json', 'utf8')) : {};
const EXCL = /(^|\/)(node_modules|examples?|templates?|fixtures?|__tests__|tests?|e2e|playground|sandbox|demos?|starters?)(\/|$)/i;
const V4PKG = /"@tailwindcss\/(postcss|vite|cli|webpack)"\s*:/;
async function raw(repo, branch, file) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${file}`);
  return res.ok ? res.text() : null;
}
function major4(range, catalog) {
  if (!range) return false;
  if (range.startsWith('catalog:')) range = catalog || '';
  return /^[\^~>=]*\s*4(\.|$)/.test(range.trim()) || /^(next|latest)$/.test(range);
}
async function check(r) {
  let tree;
  try {
    tree = JSON.parse(execFileSync('gh', ['api', `repos/${r.full_name}/git/trees/${r.branch}?recursive=1`], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  } catch { return { error: 'tree' }; }
  const paths = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);
  const pkgs = paths.filter((p) => p.endsWith('package.json') && !EXCL.test(p) && p.split('/').length <= 4);
  const tsx = paths.filter((p) => /\.(tsx|jsx)$/.test(p) && !EXCL.test(p) && !/\.(stories|test|spec)\./.test(p)).length;
  const vue = paths.filter((p) => /\.(vue|svelte|astro)$/.test(p) && !EXCL.test(p)).length;
  let catalog = null;
  if (paths.includes('pnpm-workspace.yaml')) {
    const y = await raw(r.full_name, r.branch, 'pnpm-workspace.yaml');
    const m = y && y.match(/^\s+['"]?tailwindcss['"]?\s*:\s*['"]?([^'"\s]+)/m);
    catalog = m ? m[1] : null;
  }
  const hits = [];
  for (const p of pkgs.slice(0, 60)) {
    const txt = await raw(r.full_name, r.branch, p);
    if (!txt) continue;
    let j; try { j = JSON.parse(txt); } catch { continue; }
    const deps = { ...j.dependencies, ...j.devDependencies };
    const tw = deps.tailwindcss;
    if (V4PKG.test(txt) || major4(tw, catalog)) hits.push({ path: p, tailwindcss: tw || null });
    else if (tw) hits.push({ path: p, tailwindcss: tw, v3: true });
  }
  return { truncated: tree.truncated, tsx, vue, pkgCount: pkgs.length, hits };
}
const limit = Number(process.argv[2] || 400);
const todo = pool.slice(0, limit).filter((r) => !done[r.full_name]);
let i = 0;
async function worker() {
  while (i < todo.length) {
    const r = todo[i++];
    done[r.full_name] = { ...(await check(r)), stars: r.stars };
    if (i % 20 === 0) { fs.writeFileSync('v4.json', JSON.stringify(done)); console.error(i, todo.length); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
fs.writeFileSync('v4.json', JSON.stringify(done));
