#!/usr/bin/env node
/**
 * State of Spacing: a dated edition generated from the quiet benchmark results.
 * Strategy section 9.1. Reads benchmarks/quiet/results/<repo>.json (written by
 * `npm run bench:quiet`), writes docs/state-of-spacing/<edition>.{md,json} and
 * refreshes docs/STATE_OF_SPACING.md with the latest edition and an index.
 *
 *   npm run bench:state-of-spacing                 # edition id = current YYYY-MM
 *   npm run bench:state-of-spacing -- --edition 2026-Q4
 *
 * Editions are compared with the previous one (by id order) so every row can
 * show its change. The page is published only under the conditions in the
 * strategy doc: fifty repositories and an audit issue per repository first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultsDir = path.join(repoRoot, 'benchmarks', 'quiet', 'results');
const editionsDir = path.join(repoRoot, 'docs', 'state-of-spacing');
const latestPath = path.join(repoRoot, 'docs', 'STATE_OF_SPACING.md');

export function topCounts(items, key, limit = 3) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit);
}

import { assessScale as coreAssessScale } from '../../src/utils/scale-inference.js';

/** Same check the rule and the audit apply (issue #88); re-exported for the bench tests. */
export function assessScale(scale) {
  return coreAssessScale(scale || {});
}

export function buildEdition(results, { id, previous = null, generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  if (!id) throw new Error('An edition id is required, for example 2026-09.');
  const previousRows = new Map((previous && previous.rows ? previous.rows : []).map((row) => [row.name, row]));

  const rows = results.map((result) => {
    const drift = (result.classified || []).filter((item) => item.category === 'drift');
    const driftCount = result.summary && Number.isFinite(result.summary.drift) ? result.summary.drift : drift.length;
    const cssFiles = result.cssFilesScanned || 0;
    const before = previousRows.get(result.name);
    const assessment = assessScale(result.scale);
    return {
      name: result.name,
      url: String(result.url || '').replace(/\.git$/, ''),
      sha: result.sha,
      cssFiles,
      cleanliness: result.scaleCleanliness,
      drift: driftCount,
      driftPer100Files: cssFiles > 0 ? Math.round((driftCount / cssFiles) * 100) : 0,
      driftDelta: before ? driftCount - before.drift : null,
      scaleReliable: assessment.plausible,
      scaleReasons: assessment.reasons,
      scaleRejected: result.scale && result.scale.rejected ? { reasons: result.scale.rejected.reasons, source: result.scale.rejected.source } : null,
      scaleSource: result.scale ? result.scale.source : 'unknown',
      scaleValues: result.scale ? result.scale.values : [],
      topProperties: topCounts(drift, 'property'),
      topValues: topCounts(drift, 'value'),
    };
  });

  rows.sort((a, b) => b.driftPer100Files - a.driftPer100Files || b.drift - a.drift || a.name.localeCompare(b.name));

  return {
    generatedAt,
    id,
    previousId: previous ? previous.id : null,
    rows,
    totals: {
      cssFiles: rows.reduce((sum, row) => sum + row.cssFiles, 0),
      drift: rows.reduce((sum, row) => sum + row.drift, 0),
      repos: rows.length,
      fallbackScales: rows.filter((row) => row.scaleSource === 'fallback').length,
      unreliableScales: rows.filter((row) => (row.scaleSource !== 'fallback' && !row.scaleReliable) || row.scaleRejected).length,
    },
  };
}

function formatCounts(entries) {
  return entries.length > 0 ? entries.map(([value, count]) => `\`${value}\` ×${count}`).join(', ') : 'none';
}

function formatDelta(delta) {
  if (delta === null || delta === undefined) return 'new';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function renderEdition(edition) {
  const withDelta = Boolean(edition.previousId);
  const lines = [
    `# State of Spacing, ${edition.id}`,
    '',
    `How consistently ${edition.totals.repos} public design systems keep their spacing on their own scale, measured by \`rhythmguard audit --scale auto\` on pinned commits and generated on ${edition.generatedAt}. Off-scale means a literal length that is not on the scale the repository itself defines; hairlines, percentages and generated or test paths are excluded. The full method and the false-positive accounting are in [\`QUIET_BENCHMARK.md\`](../QUIET_BENCHMARK.md).`,
    '',
    'This is not a ranking of teams. It is a reading of one signal on a fixed commit, and the row order is drift per 100 CSS files so that large codebases are not penalised for size. Every row reproduces with one command in a checkout of that commit:',
    '',
    '```bash',
    'npx rhythmguard audit . --scale auto --format markdown',
    '```',
    '',
    `Across the set: ${edition.totals.drift} off-scale values in ${edition.totals.cssFiles} CSS files; ${edition.totals.fallbackScales} of ${edition.totals.repos} repositories had no discoverable spacing tokens and were measured against the \`rhythmic-4\` fallback, which says more about token discovery than about their CSS${edition.totals.unreliableScales > 0 ? `, and ${edition.totals.unreliableScales} more had an inference the plausibility check rejected (marked \`rejected\`, or \`unreliable\` when the bench alone rejects it; usually component-local variables, see issues #54 and #88)` : ''}.${withDelta ? ` Changes are since ${edition.previousId}.` : ''}`,
    '',
    '## Repositories',
    '',
    `| Repo | Commit | Scale source | Off-scale | per 100 CSS files | Cleanliness | Top values | Top properties |${withDelta ? ' Δ off-scale |' : ''}`,
    `| --- | --- | --- | ---: | ---: | ---: | --- | --- |${withDelta ? ' ---: |' : ''}`,
  ];

  for (const row of edition.rows) {
    lines.push(`| [${row.name}](${row.url}) | \`${row.sha}\` | ${row.scaleSource}${row.scaleRejected ? ` (${row.scaleRejected.source} rejected)` : row.scaleSource !== 'fallback' && !row.scaleReliable ? ' (unreliable)' : ''} | ${row.drift} | ${row.driftPer100Files} | ${row.cleanliness}% | ${formatCounts(row.topValues)} | ${formatCounts(row.topProperties)} |${withDelta ? ` ${formatDelta(row.driftDelta)} |` : ''}`);
  }

  lines.push(
    '',
    '## Reading the columns',
    '',
    '- **Off-scale** counts findings a maintainer would be asked to look at, after the benchmark\'s noise and allowance classification. **Cleanliness** is the share of scanned files with no finding at all.',
    '- **Top values** are the numbers that drifted. Three values usually explain most of a repository\'s drift, and each one is a single decision: a missing step, a mistake, or a token that was never defined.',
    '- **Top properties** are where the layout decision lives. A table led by sibling margins usually means the parent should own the spacing with `gap`; a table led by `padding` is component-internal and is fixed per component.',
    '- **Top properties** may include `class-string`, which is a Tailwind arbitrary value in a template rather than a CSS declaration.',
    '- **Scale source** `fallback (scanned-css rejected)` means tokens were found but the rule itself rejected them as a scale and measured against the preset instead. `unreliable` marks a scanned scale that failed a plausibility check (fractional steps, no four-based ladder, or sources that are component files rather than token files). Its row is measured against a scale the repository probably did not design; treat it like a fallback.',
    '- **Scale source** `fallback` means the audit found fewer than three spacing tokens and used a default scale. Treat those rows as a to-do for token discovery, not as a verdict on the CSS.',
    '',
    '## Method and caveats',
    '',
    '- Sass variables and functions are not evaluated, so systems that route spacing through `$spacer` or `spacing()` show few literal findings and, often, a fallback scale.',
    '- Editions are cut from the same pinned commits as the benchmark snapshots. A repository moves between editions only when its pin is updated with `npm run bench:quiet -- --latest --update-snapshots`.',
    '- Repositories are added through `benchmarks/quiet/repos.json`; a contributor guide is in `CONTRIBUTING.md`.',
    '',
  );

  return lines.join('\n');
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = { edition: new Date().toISOString().slice(0, 7), resultsDir };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--edition') args.edition = String(argv[++i] || '');
    else if (argv[i] === '--results') args.resultsDir = path.resolve(String(argv[++i] || ''));
  }
  return args;
}

export function renderIndex(editionIds, latestId) {
  return [
    '',
    '## Editions',
    '',
    ...editionIds.map((id) => `- [${id}](./state-of-spacing/${id}.md)${id === latestId ? ' (this page)' : ''}`),
    '',
  ].join('\n');
}

export function writeEdition({ edition: id, resultsDir: dir } = parseArgs(process.argv.slice(2))) {
  const results = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => loadJson(path.join(dir, file), null))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (results.length === 0) {
    throw new Error(`No benchmark results in ${dir}. Run \`npm run bench:quiet\` first.`);
  }

  fs.mkdirSync(editionsDir, { recursive: true });
  const existing = fs.readdirSync(editionsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .filter((existingId) => existingId < id)
    .sort();
  const previous = existing.length > 0 ? loadJson(path.join(editionsDir, `${existing.at(-1)}.json`), null) : null;

  const edition = buildEdition(results, { id, previous });
  const markdown = renderEdition(edition);
  fs.writeFileSync(path.join(editionsDir, `${id}.md`), markdown);
  fs.writeFileSync(path.join(editionsDir, `${id}.json`), `${JSON.stringify(edition, null, 2)}\n`);

  const ids = fs.readdirSync(editionsDir).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, '')).sort().reverse();
  fs.writeFileSync(latestPath, markdown.replace(/\]\(\.\.\//g, '](./').replace(/`benchmarks\//g, '`benchmarks/') + renderIndex(ids, id));
  return { edition, files: [path.join(editionsDir, `${id}.md`), path.join(editionsDir, `${id}.json`), latestPath].map((file) => path.relative(repoRoot, file)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { edition, files } = writeEdition();
  process.stdout.write(`State of Spacing ${edition.id}: ${edition.totals.repos} repos, ${edition.totals.drift} off-scale values${edition.previousId ? `, compared with ${edition.previousId}` : ''}\n`);
  for (const file of files) process.stdout.write(`wrote ${file}\n`);
}
