#!/usr/bin/env node
/**
 * Tailwind v4 sample, step 3 of 3: the mechanical app test per v4 package.
 * Reads pool.json and v4.json, writes classified.json and prints one line per
 * repo. A package counts as an app when its tailwindcss range is v4, its
 * directory is not docs, a site, a playground, a component library or similar,
 * it depends on an app framework, it is not a published library, and it holds
 * 50 or more TSX/JSX files. The repo-level judgement calls on top of this are
 * listed with reasons in benchmarks/tailwind-v4/README.md.
 *
 *   node classify.mjs <path to benchmarks/quiet/repos.json>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { fetch } = globalThis;
const pool = JSON.parse(fs.readFileSync('pool.json', 'utf8'));
const by = Object.fromEntries(pool.map((r) => [r.full_name, r]));
const v4 = JSON.parse(fs.readFileSync('v4.json', 'utf8'));
const quiet = new Set(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).repos.map((x) => x.url.replace('https://github.com/', '').replace('.git', '').toLowerCase()));
const EXCL = /(^|\/)(node_modules|examples?|templates?|fixtures?|__tests__|tests?|e2e|playground|sandbox|demos?|starters?)(\/|$)/i;
const NOT_APP_DIR = /(^|\/)(docs?|documentation|website|www|site|landing(-page)?|marketing|blog|playgrounds?|[\w-]*-playground|storybook|kitchen-sink|benchmarks?|ui|design-system|ui-library|ui-registry|registry|ui-components|ui-patterns|components|brand|community-templates|skel[\w-]*|kb|learn|public)$/i;
const FRAMEWORK = /^(next|vite|react-router|@react-router\/dev|@remix-run\/react|@tanstack\/react-start|@tanstack\/start|electron|@tauri-apps\/api|react-scripts|@rsbuild\/core|@rspack\/core|webpack|waku|expo|vite-plus|@vitejs\/plugin-react|@tanstack\/react-router|@tanstack\/router-plugin|electron-vite)$/;
const raw = async (r, f) => { const res = await fetch(`https://raw.githubusercontent.com/${r.full_name}/${r.branch}/${f}`); return res.ok ? res.text() : null; };
const rows = [];
const names = Object.keys(v4).filter((k) => v4[k].hits.some((h) => !h.v3)).sort((a, b) => v4[b].stars - v4[a].stars);
for (const name of names) {
  const r = by[name];
  const row = { repo: name, stars: r.stars, template: !!r.isTemplate, quiet: quiet.has(name.toLowerCase()), apps: [], rejected: [] };
  let tree;
  try { tree = JSON.parse(execFileSync('gh', ['api', `repos/${name}/git/trees/${r.branch}?recursive=1`], { encoding: 'utf8', maxBuffer: 1 << 28 })).tree.filter((t) => t.type === 'blob').map((t) => t.path); } catch { row.error = 'tree'; rows.push(row); continue; }
  for (const hit of v4[name].hits.filter((h) => !h.v3)) {
    const dir = hit.path === 'package.json' ? '' : hit.path.slice(0, -'/package.json'.length);
    const j = JSON.parse(await raw(r, hit.path));
    const deps = { ...j.dependencies, ...j.devDependencies };
    if (deps.tailwindcss && !/^(catalog:|[\^~>=]*\s*4)/.test(deps.tailwindcss) && !/^(workspace:|\*)/.test(deps.tailwindcss)) { row.rejected.push(`${dir || '.'}: tailwindcss ${deps.tailwindcss}`); continue; }
    if (dir && NOT_APP_DIR.test(dir)) { row.rejected.push(`${dir}: not an app directory`); continue; }
    const fw = Object.keys(deps).filter((d) => FRAMEWORK.test(d));
    const prefix = dir ? dir + '/' : '';
    const tsx = tree.filter((p) => p.startsWith(prefix) && /\.(tsx|jsx)$/.test(p) && !EXCL.test(p.slice(prefix.length)) && !/\.(stories|test|spec)\./.test(p)).length;
    const lib = j.private !== true && (j.exports || j.module);
    const reason = !fw.length ? 'no app framework dependency' : lib ? 'published library package' : tsx < 50 ? `only ${tsx} TSX/JSX files` : null;
    if (reason) { row.rejected.push(`${dir || '.'}: ${reason}`); continue; }
    row.apps.push({ dir: dir || '.', tsx, framework: fw.join('+'), tailwindcss: deps.tailwindcss || null });
  }
  rows.push(row);
}
fs.writeFileSync('classified.json', JSON.stringify(rows, null, 1));
for (const row of rows) {
  const flag = row.template ? 'TEMPLATE' : row.quiet ? 'QUIET' : row.apps.length ? 'APP' : 'none';
  console.log(`${row.stars}\t${row.repo}\t${flag}\t${row.apps.map((a) => `${a.dir}(${a.tsx},${a.framework})`).join(' ')}\t|| ${row.rejected.join('; ').slice(0, 160)}`);
}
