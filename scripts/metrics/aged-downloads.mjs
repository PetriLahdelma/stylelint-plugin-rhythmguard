#!/usr/bin/env node
/**
 * The download unit every checkpoint reads (council Amendment 2). npm's last-week
 * downloads per version, joined with each version's publish time:
 *
 *   aged       versions published 14 or more days before today, which strips our
 *              own release and smoke runs (the ESLint plan's definition)
 *   pin        an aged version that alone is more than half of the whole week,
 *              which only one lockfile running CI can produce (3.6.0 was 59.5% of
 *              the plugin's week on 2026-11-05)
 *   ex-pin     aged minus the pin: the number a checkpoint compares to its target
 *
 *   node scripts/metrics/aged-downloads.mjs           # print the table
 *   node scripts/metrics/aged-downloads.mjs --write   # also append a row to docs/metrics.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = ['stylelint-plugin-rhythmguard', 'rhythmguard', 'eslint-plugin-rhythmguard'];
const AGED_DAYS = 14;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const metricsPath = path.join(repoRoot, 'docs', 'metrics.md');

async function getJson(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export function summarize(downloads, publishTimes, now, agedDays = AGED_DAYS) {
  const cutoff = now.getTime() - agedDays * 24 * 60 * 60 * 1000;
  let total = 0;
  const aged = [];
  for (const [version, count] of Object.entries(downloads)) {
    total += count;
    const published = Date.parse(publishTimes[version] || '');
    if (Number.isFinite(published) && published <= cutoff) aged.push([version, count]);
  }
  aged.sort((a, b) => b[1] - a[1]);
  const agedTotal = aged.reduce((sum, [, count]) => sum + count, 0);
  const [topVersion, topCount = 0] = aged[0] || [];
  const isPin = total > 0 && topCount * 2 > total;
  return {
    total,
    aged: agedTotal,
    pinVersion: isPin ? topVersion : null,
    pinCount: isPin ? topCount : 0,
    exPin: agedTotal - (isPin ? topCount : 0),
  };
}

async function measure(pkg, now) {
  const [{ downloads }, packument] = await Promise.all([
    getJson(`https://api.npmjs.org/versions/${encodeURIComponent(pkg)}/last-week`),
    getJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`),
  ]);
  return { pkg, ...summarize(downloads, packument.time || {}, now) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const rows = await Promise.all(PACKAGES.map((pkg) => measure(pkg, now)));
  for (const r of rows) {
    const pin = r.pinVersion ? `${r.pinVersion} ${r.pinCount} (${Math.round((r.pinCount / r.total) * 1000) / 10}% of the week)` : 'none';
    console.log(`${r.pkg}: week ${r.total}, aged ${r.aged}, pin ${pin}, aged ex-pin ${r.exPin}`);
  }
  if (process.argv.includes('--write')) {
    const cell = (r) => `${r.exPin} (week ${r.total}, aged ${r.aged}, pin ${r.pinVersion ? `${r.pinVersion} ${r.pinCount}` : 'none'})`;
    fs.appendFileSync(metricsPath, `| ${date} | ${rows.map(cell).join(' | ')} |\n`);
    console.log(`Appended a row to ${path.relative(repoRoot, metricsPath)}.`);
  }
}
