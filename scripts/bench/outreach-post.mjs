#!/usr/bin/env node
/**
 * Posts the drafted audit issues, one repository at a time, with a preflight
 * per repository and a pause between posts. Skips repositories that are
 * archived, have issues disabled, or have switched blank issues off (their
 * templates are the accepted channel; those drafts are left for a person).
 * Appends every outcome to docs/outreach/embed-log.md.
 *
 *   node scripts/bench/outreach-post.mjs --dry-run
 *   node scripts/bench/outreach-post.mjs --only forem,zulip
 *   node scripts/bench/outreach-post.mjs --pause 90
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(repoRoot, 'benchmarks', 'quiet', 'outreach.json');
const logPath = path.join(repoRoot, 'docs', 'outreach', 'embed-log.md');

function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

export function preflight({ owner, repo }) {
  const meta = JSON.parse(gh(['api', `repos/${owner}/${repo}`, '--jq', '{archived,has_issues}']));
  if (meta.archived) return { ok: false, reason: 'archived' };
  if (!meta.has_issues) return { ok: false, reason: 'issues disabled' };
  const config = gh(['api', `repos/${owner}/${repo}/contents/.github/ISSUE_TEMPLATE/config.yml`, '--jq', '.content'], { allowFail: true });
  if (config && /blank_issues_enabled:\s*false/.test(Buffer.from(config.trim(), 'base64').toString('utf8'))) {
    return { ok: false, reason: 'blank issues disabled; use their template by hand' };
  }
  return { ok: true };
}

function alreadyPosted(name) {
  if (!fs.existsSync(logPath)) return null;
  const match = fs.readFileSync(logPath, 'utf8').match(new RegExp(`^\\| ${name} \\| .*?\\| (https://\\S+) \\|`, 'm'));
  return match ? match[1] : null;
}

function appendLog(row) {
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, '# Outreach log\n\nEvery audit issue opened from the benchmark, and every response, so the pattern of objections becomes the next backlog (strategy B4). Drafts live in `audits/`.\n\n| Repo | Date | Outcome | Link |\n| --- | --- | --- | --- |\n');
  }
  fs.appendFileSync(logPath, `| ${row.name} | ${row.date} | ${row.outcome} | ${row.link || ''} |\n`);
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const onlyIndex = argv.indexOf('--only');
const only = onlyIndex !== -1 ? new Set(String(argv[onlyIndex + 1] || '').split(',').filter(Boolean)) : null;
const pauseIndex = argv.indexOf('--pause');
const pause = pauseIndex !== -1 ? Number(argv[pauseIndex + 1]) : 75;

const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const date = new Date().toISOString().slice(0, 10);
let posted = 0;
for (const entry of entries) {
  if (only && !only.has(entry.name)) continue;
  const label = entry.name.padEnd(26);
  if (!entry.github) {
    process.stdout.write(`${label} skip: not on GitHub\n`);
    if (!dryRun) appendLog({ name: entry.name, date, outcome: 'skipped: not on GitHub, post by hand' });
    continue;
  }
  const existing = alreadyPosted(entry.name);
  if (existing) {
    process.stdout.write(`${label} already posted: ${existing}\n`);
    continue;
  }
  const check = preflight(entry.github);
  if (!check.ok) {
    process.stdout.write(`${label} skip: ${check.reason}\n`);
    if (!dryRun) appendLog({ name: entry.name, date, outcome: `skipped: ${check.reason}` });
    continue;
  }
  if (dryRun) {
    process.stdout.write(`${label} would post: ${entry.title}\n`);
    continue;
  }
  if (posted > 0) await sleep(pause);
  const url = gh(['issue', 'create', '--repo', `${entry.github.owner}/${entry.github.repo}`, '--title', entry.title, '--body-file', path.join(repoRoot, entry.bodyFile)]).trim();
  posted += 1;
  process.stdout.write(`${label} posted: ${url}\n`);
  appendLog({ name: entry.name, date, outcome: 'opened', link: url });
}
process.stdout.write(`\n${dryRun ? 'dry run complete' : `${posted} issues opened`}\n`);
