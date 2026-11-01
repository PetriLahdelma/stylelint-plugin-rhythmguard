#!/usr/bin/env node
/**
 * Tailwind v4 sample, step 1 of 3: the candidate pool. GitHub repository search,
 * nine topic queries, 1,000+ stars, not archived, not a fork, pushed since
 * 2026-08-01, sorted by stars. Writes pool.json to the current directory.
 * See benchmarks/tailwind-v4/README.md. Needs an authenticated `gh`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const queries = [
  'topic:tailwindcss', 'topic:nextjs', 'topic:react', 'topic:vite', 'topic:saas',
  'topic:self-hosted', 'topic:open-source', 'topic:shadcn-ui', 'topic:typescript',
].map((t) => `${t} stars:>=1000 archived:false fork:false pushed:>=2026-08-01`);
const repos = new Map();
for (const q of queries) {
  for (let page = 1; page <= 10; page++) {
    let out;
    try {
      out = execFileSync('gh', ['api', '-X', 'GET', 'search/repositories', '-f', `q=${q}`, '-f', 'sort=stars', '-f', 'order=desc', '-f', 'per_page=100', '-f', `page=${page}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
    } catch (e) { console.error('fail', q, page, String(e.stderr).slice(0, 200)); await new Promise(r => setTimeout(r, 61000)); page--; continue; }
    const items = JSON.parse(out).items;
    for (const r of items) repos.set(r.full_name, { full_name: r.full_name, stars: r.stargazers_count, lang: r.language, desc: r.description, topics: r.topics, branch: r.default_branch, pushed: r.pushed_at, homepage: r.homepage, isTemplate: r.is_template });
    console.error(q.split(' ')[0], page, items.length, repos.size);
    if (items.length < 100) break;
    await new Promise(r => setTimeout(r, 2200));
  }
}
fs.writeFileSync('pool.json', JSON.stringify([...repos.values()].sort((a, b) => b.stars - a.stars), null, 1));
